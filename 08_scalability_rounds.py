import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import tensorflow as tf
from tensorflow.keras import layers, models

# ============ ONLY THING TO CHANGE BETWEEN RUNS ============
ROUNDS = 10   # run this script twice: 10, then 20
# =============================================================

DATA_DIR = '/content/drive/MyDrive/FedShield_data'
CKPT_DIR = f'{DATA_DIR}/checkpoints_R{ROUNDS}'
os.makedirs(CKPT_DIR, exist_ok=True)

W = 10
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
clients = ['Blinds','Refrigerator','Meter','Thermostat','Camera','Smart_Lock','Smart_TV']

wm = pd.read_csv('/content/working_matrix_partitioned.csv')
FEATURE_COLS = [c for c in wm.columns if c not in ['label','class8','shard']]
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}
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
print(f"Test set: {X_test.shape[0]} windows")
del wm, test_pool, Xg, yg; gc.collect()

def build_model(k=1):
    inp = layers.Input(shape=(W, len(FEATURE_COLS)))
    x = layers.Conv1D(64, k, padding='same', activation='relu')(inp)
    x = layers.MaxPool1D()(x); x = layers.LSTM(64)(x)
    x = layers.Dense(32, activation='relu')(x)
    out = layers.Dense(8, activation='softmax')(x)
    m = models.Model(inp, out)
    m.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return m

E = 5
global_model = build_model()
start_round = 0
ckpt_files = sorted([f for f in os.listdir(CKPT_DIR) if f.startswith('round_') and f.endswith('.weights.h5')],
                     key=lambda f: int(f.split('_')[1].split('.')[0]))
if ckpt_files:
    last = ckpt_files[-1]
    start_round = int(last.split('_')[1].split('.')[0])
    global_model.load_weights(f'{CKPT_DIR}/{last}')
    print(f"Resuming R={ROUNDS} from checkpoint: {last} (round {start_round} already complete)")
weights = global_model.get_weights()

for rnd in range(start_round, ROUNDS):
    local_ws = []
    for c in clients:
        data = np.load(f'{DATA_DIR}/client_{c}.npz')
        Xw, yw = data['X'], data['y']
        lm = build_model(); lm.set_weights(weights)
        lm.fit(Xw, yw, epochs=E, batch_size=64, verbose=0)
        local_ws.append(lm.get_weights())
        del lm, Xw, yw, data; gc.collect()
    weights = [np.mean([lw[i] for lw in local_ws], axis=0) for i in range(len(weights))]
    global_model.set_weights(weights)
    global_model.save_weights(f'{CKPT_DIR}/round_{rnd+1}.weights.h5')
    print(f"R={ROUNDS} Round {rnd+1}/{ROUNDS} done and checkpointed")

y_pred = np.argmax(global_model.predict(X_test), axis=1)
report = classification_report(y_test, y_pred, labels=list(range(8)), target_names=CLASS_ORDER, digits=2, zero_division=0, output_dict=True)
print(classification_report(y_test, y_pred, labels=list(range(8)), target_names=CLASS_ORDER, digits=2, zero_division=0))

print(f"\n=== SUMMARY FOR TABLE (M=7, R={ROUNDS}) ===")
print(f"Accuracy: {report['accuracy']*100:.2f}")
print(f"Weighted F1: {report['weighted avg']['f1-score']*100:.2f}")
print(f"Macro F1: {report['macro avg']['f1-score']*100:.2f}")
