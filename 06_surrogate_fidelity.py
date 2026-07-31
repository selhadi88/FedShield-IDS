import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import r2_score
from scipy.stats import kendalltau
from tensorflow.keras.models import load_model

DATA_DIR = '/content/drive/MyDrive/FedShield_data'
W = 10
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}

wm = pd.read_csv('/content/working_matrix_partitioned.csv')
FEATURE_COLS = [c for c in wm.columns if c not in ['label','class8','shard']]
wm['y'] = wm['class8'].map(class_to_idx)

def cap_per_class(df, cap, seed=42):
    parts = []
    for cls, grp in df.groupby('class8'):
        if len(grp) > cap: grp = grp.sample(n=cap, random_state=seed)
        parts.append(grp)
    return pd.concat(parts).reset_index(drop=True)

def make_windows_within_class(df, stride=1):
    all_X, all_y = [], []
    for cls, grp in df.groupby('class8'):
        X = grp[FEATURE_COLS].values.astype('float32'); n = len(X)
        if n < W: continue
        n_windows = (n - W) // stride + 1
        Xs = np.empty((n_windows, W, len(FEATURE_COLS)), dtype='float32')
        for i, s in enumerate(range(0, n - W + 1, stride)):
            Xs[i] = X[s:s+W]
        all_X.append(Xs); all_y.append(np.full(n_windows, class_to_idx[cls]))
    if not all_X: return np.empty((0,W,len(FEATURE_COLS)),dtype='float32'), np.empty((0,),dtype=int)
    return np.concatenate(all_X), np.concatenate(all_y)

test_pool = cap_per_class(wm, cap=10000)
for col in FEATURE_COLS:
    fm = test_pool.loc[np.isfinite(test_pool[col]), col].max()
    test_pool[col] = test_pool[col].replace([np.inf,-np.inf], fm)
test_pool[FEATURE_COLS] = test_pool[FEATURE_COLS].fillna(0)
for col in FEATURE_COLS:
    test_pool[col] = np.log10(1 + test_pool[col].clip(lower=0))
test_pool[FEATURE_COLS] = MinMaxScaler().fit_transform(test_pool[FEATURE_COLS])
Xg, yg = make_windows_within_class(test_pool, stride=1)
try:
    _, X_test, _, y_test = train_test_split(Xg, yg, test_size=0.20, stratify=yg, random_state=42)
except ValueError:
    _, X_test, _, y_test = train_test_split(Xg, yg, test_size=0.20, random_state=42)
del wm, test_pool, Xg, yg; gc.collect()

cnn_lstm = load_model(f'{DATA_DIR}/baseline_model_fullscale.h5')
cnn_probs_all = cnn_lstm.predict(X_test, verbose=0)
cnn_preds_all = np.argmax(cnn_probs_all, axis=1)

# KEY FIX: split into a surrogate-FIT set and a genuinely held-out surrogate-EVAL set
X_flat = X_test.reshape(X_test.shape[0], -1)
idx = np.arange(len(X_flat))
try:
    fit_idx, eval_idx = train_test_split(idx, test_size=0.30, stratify=cnn_preds_all, random_state=42)
except ValueError:
    fit_idx, eval_idx = train_test_split(idx, test_size=0.30, random_state=42)

rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1, max_depth=12)  # capped depth to reduce memorization
rf.fit(X_flat[fit_idx], cnn_preds_all[fit_idx])

# Evaluate ONLY on eval_idx -- data the surrogate never saw while fitting
cnn_probs_eval = cnn_probs_all[eval_idx]
cnn_preds_eval = cnn_preds_all[eval_idx]
rf_probs_eval = rf.predict_proba(X_flat[eval_idx])
rf_preds_eval = rf.predict(X_flat[eval_idx])

agreement = (rf_preds_eval == cnn_preds_eval).mean()
r2 = r2_score(cnn_probs_eval, rf_probs_eval)
taus = []
for i in range(len(eval_idx)):
    tau, _ = kendalltau(cnn_probs_eval[i], rf_probs_eval[i])
    if not np.isnan(tau): taus.append(tau)
avg_tau = np.mean(taus)

print(f"Fit set: {len(fit_idx)} windows, Held-out eval set: {len(eval_idx)} windows (never seen by surrogate during fitting)")
print(f"\n=== Surrogate Fidelity (genuinely held-out) ===")
print(f"Prediction agreement rate: {agreement*100:.2f}%")
print(f"R^2 (probability regression): {r2:.4f}")
print(f"Average Kendall's tau: {avg_tau:.4f}")
