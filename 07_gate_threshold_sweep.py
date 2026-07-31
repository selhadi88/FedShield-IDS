import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from tensorflow.keras.models import load_model

DATA_DIR = '/content/drive/MyDrive/FedShield_data'
W = 10
K = 10          # smoothing window, matches Eq. (smooth) in the paper
MS_PER_WINDOW = 50   # assumed inter-window arrival time; documented assumption for latency conversion
N_TRIALS = 50
LEAD_IN = 10    # benign windows before attack onset, per trial
ATTACK_LEN = 40 # attack windows after onset, per trial
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}
ATTACK_CLASSES = [1,2,3,4,5,6,7]  # all except Benign(0)

# ---- Rebuild the same test set used for the baseline model ----
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

model = load_model(f'{DATA_DIR}/baseline_model_fullscale.h5')

# ---- Build 50 attack-injection trials: benign lead-in, then a randomly chosen attack class ----
rng = np.random.default_rng(42)
benign_idx = np.where(y_test == 0)[0]

trials = []
for t in range(N_TRIALS):
    atk_class = rng.choice(ATTACK_CLASSES)
    atk_idx = np.where(y_test == atk_class)[0]
    lead = rng.choice(benign_idx, size=LEAD_IN, replace=True)
    atk = rng.choice(atk_idx, size=ATTACK_LEN, replace=True)
    seq_idx = np.concatenate([lead, atk])
    trials.append((atk_class, seq_idx))

print(f"Built {N_TRIALS} trials, each {LEAD_IN} benign + {ATTACK_LEN} attack windows")

def raw_conf(probs):
    # max softmax prob over attack classes only, per Eq. (yraw)
    return probs[:, ATTACK_CLASSES].max(axis=1)

def smooth(raw, k=K):
    out = np.zeros_like(raw)
    for i in range(len(raw)):
        lo = max(0, i - k + 1)
        out[i] = raw[lo:i+1].mean()
    return out

# Precompute raw confidence traces per trial (model inference is the expensive part, do once)
trial_traces = []
for atk_class, seq_idx in trials:
    probs = model.predict(X_test[seq_idx], verbose=0)
    raw = raw_conf(probs)
    sm = smooth(raw)
    trial_traces.append((atk_class, sm))

alphas = [0.65, 0.70, 0.75, 0.80, 0.85]
print(f"\n{'alpha':>6} {'false_quarantines':>18} {'missed_delayed':>15} {'mean_ttq_ms':>12}")
for alpha in alphas:
    false_q = 0
    missed = 0
    ttqs = []
    for atk_class, sm in trial_traces:
        trigger_idx = np.argmax(sm >= alpha) if (sm >= alpha).any() else -1
        if trigger_idx == -1:
            missed += 1
        elif trigger_idx < LEAD_IN:
            false_q += 1
        else:
            ttq_windows = trigger_idx - LEAD_IN
            ttqs.append(ttq_windows * MS_PER_WINDOW)
    mean_ttq = np.mean(ttqs) if ttqs else float('nan')
    print(f"{alpha:>6.2f} {false_q:>18d} {missed:>15d} {mean_ttq:>12.2f}")
