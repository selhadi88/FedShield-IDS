import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from imblearn.over_sampling import SMOTE
from google.colab import drive

drive.mount('/content/drive')
DATA_DIR = '/content/drive/MyDrive/FedShield_data'
os.makedirs(DATA_DIR, exist_ok=True)

wm = pd.read_csv('/content/working_matrix_partitioned.csv')
FEATURE_COLS = [c for c in wm.columns if c not in ['label','class8','shard']]
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}
wm['y'] = wm['class8'].map(class_to_idx)

W = 10
STRIDE = 2
CAP_PER_CLASS = 20000
SMOTE_TARGET = 8000

def cap_per_class(df, cap=CAP_PER_CLASS, seed=42):
    parts = []
    for cls, grp in df.groupby('class8'):
        if len(grp) > cap:
            grp = grp.sample(n=cap, random_state=seed)
        parts.append(grp)
    return pd.concat(parts).reset_index(drop=True)

def make_windows_within_class(df):
    all_X, all_y = [], []
    for cls, grp in df.groupby('class8'):
        X = grp[FEATURE_COLS].values.astype('float32')
        n = len(X)
        if n < W: continue
        n_windows = (n - W) // STRIDE + 1
        Xs = np.empty((n_windows, W, len(FEATURE_COLS)), dtype='float32')
        for i, s in enumerate(range(0, n - W + 1, STRIDE)):
            Xs[i] = X[s:s+W]
        all_X.append(Xs)
        all_y.append(np.full(n_windows, class_to_idx[cls]))
    if not all_X:
        return np.empty((0,W,len(FEATURE_COLS)), dtype='float32'), np.empty((0,),dtype=int)
    return np.concatenate(all_X), np.concatenate(all_y)

def preprocess_client(df, client_name=""):
    df = cap_per_class(df)
    print(f"  {client_name}: {len(df)} rows after per-class capping")
    for col in FEATURE_COLS:
        fm = df.loc[np.isfinite(df[col]), col].max()
        df[col] = df[col].replace([np.inf,-np.inf], fm)
    df[FEATURE_COLS] = df[FEATURE_COLS].fillna(0)
    for col in FEATURE_COLS:
        df[col] = np.log10(1 + df[col].clip(lower=0))
    df[FEATURE_COLS] = MinMaxScaler().fit_transform(df[FEATURE_COLS])
    Xw, yw = make_windows_within_class(df)
    print(f"  {client_name}: {len(Xw)} windows before SMOTE, classes: {sorted(set(yw))}")
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
    print(f"  {client_name}: {len(Xw)} windows final, classes: {sorted(set(yw))}")
    del df; gc.collect()
    return Xw, yw

clients = wm['shard'].unique()
for c in clients:
    out_path = f"{DATA_DIR}/client_{c.replace(' ','_')}.npz"
    if os.path.exists(out_path):
        print(f"  {c}: already processed, skipping")
        continue
    Xw, yw = preprocess_client(wm[wm['shard']==c], client_name=c)
    np.savez_compressed(out_path, X=Xw, y=yw)
    print(f"  {c}: saved to {out_path}\n")
    del Xw, yw; gc.collect()

print("All clients processed and saved to Drive.")
