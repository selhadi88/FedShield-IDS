import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from imblearn.over_sampling import SMOTE
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import tensorflow as tf
from tensorflow.keras import layers, models

# ============ ONLY THING TO CHANGE BETWEEN RUNS ============
M = 10   # run this script 3 times: 10, then 20, then 50
# =============================================================

DATA_DIR = '/content/drive/MyDrive/FedShield_data'
PREP_DIR = f'{DATA_DIR}/scalability_M{M}'
CKPT_DIR = f'{PREP_DIR}/checkpoints'
os.makedirs(CKPT_DIR, exist_ok=True)

W = 10
STRIDE = 2
CAP_PER_CLASS = 20000
SMOTE_TARGET = 8000
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}

wm_full = pd.read_csv('/content/working_matrix_partitioned.csv')
FEATURE_COLS = [c for c in wm_full.columns if c not in ['label','class8','shard']]
wm_full['y'] = wm_full['class8'].map(class_to_idx)

# ---- Repartition into M clients using simple round-robin-by-class (extends the
#      device-profile enrichment scheme to arbitrary M without redesigning per-device
#      profiles for M=10/20/50) ----
def repartition(df, m, seed=42):
    rng = np.random.default_rng(seed)
    shard_ids = np.zeros(len(df), dtype=int)
    for cls, grp in df.groupby('class8'):
        idx = grp.index.values
        assignment = rng.integers(0, m, size=len(idx))
        shard_ids[df.index.get_indexer(idx)] = assignment
    df = df.copy()
    df['shard_m'] = shard_ids
    return df

wm_full = repartition(wm_full, M)
clients = list(range(M))

def cap_per_class(df, cap, seed=42):
    parts = []
    for cls, grp in df.groupby('class8'):
        if len(grp) > cap: grp = grp.sample(n=cap, random_state=seed)
        parts.append(grp)
    return pd.concat(parts).reset_index(drop=True)

def make_windows_within_class(df, w=W, stride=STRIDE):
    all_X, all_y = [], []
    for cls, grp in df.groupby('class8'):
        X = grp[FEATURE_COLS].values.astype('float32'); n = len(X)
        if n < w: continue
        n_windows = (n - w) // stride + 1
        Xs = np.empty((n_windows, w, len(FEATURE_COLS)), dtype='float32')
        for i, s in enumerate(range(0, n - w + 1, stride)):
            Xs[i] = X[s:s+w]
        all_X.append(Xs); all_y.append(np.full(n_windows, class_to_idx[cls]))
    if not all_X: return np.empty((0,w,len(FEATURE_COLS)),dtype='float32'), np.empty((0,),dtype=int)
    return np.concatenate(all_X), np.concatenate(all_y)

def preprocess_client(df, client_name=""):
    df = cap_per_class(df, max(2000, CAP_PER_CLASS // (M // 7 + 1)))  # scale cap down as M grows to keep runtime reasonable
    for col in FEATURE_COLS:
        fm = df.loc[np.isfinite(df[col]), col].max()
        df[col] = df[col].replace([np.inf,-np.inf], fm)
    df[FEATURE_COLS] = df[FEATURE_COLS].fillna(0)
    for col in FEATURE_COLS:
        df[col] = np.log10(1 + df[col].clip(lower=0))
    df[FEATURE_COLS] = MinMaxScaler().fit_transform(df[FEATURE_COLS])
    Xw, yw = make_windows_within_class(df)
    if len(Xw) > 0:
        n_,w_,f_ = Xw.shape; Xf = Xw.reshape(n_, w_*f_)
        counts = np.bincount(yw, minlength=8)
        present = np.where(counts > 0)[0]
        strategy = {c: SMOTE_TARGET for c in present if counts[c] < SMOTE_TARGET and counts[c] >= 2}
        if strategy:
            min_count = min(counts[c] for c in strategy)
            k_neighbors = min(5, max(1, min_count - 1))
            try:
                sm = SMOTE(random_state=42, k_neighbors=k_neighbors, sampling_strategy=strategy)
                Xf, yw = sm.fit_resample(Xf, yw)
                Xw = Xf.reshape(-1, w_, f_).astype('float32')
            except Exception as e:
                print(f"  SMOTE skipped: {e}")
    perm = np.random.default_rng(42).permutation(len(Xw))
    Xw, yw = Xw[perm], yw[perm]
    print(f"  Client {client_name}: {len(Xw)} windows, classes: {sorted(set(yw))}")
    del df; gc.collect()
    return Xw, yw

for c in clients:
    out_path = f"{PREP_DIR}/client_{c}.npz"
    if os.path.exists(out_path):
        print(f"  Client {c}: already prepped, skipping")
        continue
    Xw, yw = preprocess_client(wm_full[wm_full['shard_m']==c], client_name=c)
    np.savez_compressed(out_path, X=Xw, y=yw)
    del Xw, yw; gc.collect()
print(f"All {M} clients prepped")

test_pool = cap_per_class(wm_full, cap=10000)
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
print(f"Test set: {X_test.shape[0]} windows")
del wm_full, test_pool, Xg, yg; gc.collect()

def build_model():
    inp = layers.Input(shape=(W, len(FEATURE_COLS)))
    x = layers.Conv1D(64, 1, padding='same', activation='relu')(inp)
    x = layers.MaxPool1D()(x); x = layers.LSTM(64)(x)
    x = layers.Dense(32, activation='relu')(x)
    out = layers.Dense(8, activation='softmax')(x)
    m = models.Model(inp, out)
    m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return m

R, E = 5, 5
global_model = build_model()
start_round = 0
ckpt_files = sorted([f for f in os.listdir(CKPT_DIR) if f.startswith('round_') and f.endswith('.weights.h5')],
                     key=lambda f: int(f.split('_')[1].split('.')[0]))
if ckpt_files:
    last = ckpt_files[-1]
    start_round = int(last.split('_')[1].split('.')[0])
    global_model.load_weights(f'{CKPT_DIR}/{last}')
    print(f"Resuming M={M} from checkpoint: {last}")
weights = global_model.get_weights()

for rnd in range(start_round, R):
    local_ws = []
    for c in clients:
        data = np.load(f'{PREP_DIR}/client_{c}.npz')
        Xw, yw = data['X'], data['y']
        if len(Xw) == 0: continue
        lm = build_model(); lm.set_weights(weights)
        lm.fit(Xw, yw, epochs=E, batch_size=64, verbose=0)
        local_ws.append(lm.get_weights())
        del lm, Xw, yw, data; gc.collect()
    weights = [np.mean([lw[i] for lw in local_ws], axis=0) for i in range(len(weights))]
    global_model.set_weights(weights)
    global_model.save_weights(f'{CKPT_DIR}/round_{rnd+1}.weights.h5')
    print(f"M={M} Round {rnd+1}/{R} done and checkpointed")

y_pred = np.argmax(global_model.predict(X_test), axis=1)
report = classification_report(y_test, y_pred, labels=list(range(8)), target_names=CLASS_ORDER, digits=2, zero_division=0, output_dict=True)
print(classification_report(y_test, y_pred, labels=list(range(8)), target_names=CLASS_ORDER, digits=2, zero_division=0))

print(f"\n=== SUMMARY FOR TABLE (M={M}, R=5) ===")
print(f"Accuracy: {report['accuracy']*100:.2f}")
print(f"Weighted F1: {report['weighted avg']['f1-score']*100:.2f}")
print(f"Macro F1: {report['macro avg']['f1-score']*100:.2f}")
