import pandas as pd, numpy as np, gc, os
from sklearn.preprocessing import MinMaxScaler
from imblearn.over_sampling import SMOTE
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import tensorflow as tf
from tensorflow.keras import layers, models

DNN_PATH = "/kaggle/input/edgeiiotset-cyber-security-dataset-of-iot-iiot/Edge-IIoTset dataset/Selected dataset for ML and DL/DNN-EdgeIIoT-dataset.csv"
DATA_DIR = '/content/drive/MyDrive/FedShield_data'
EDGE_DIR = f'{DATA_DIR}/edgeiiot'
CKPT_DIR = f'{EDGE_DIR}/checkpoints'
os.makedirs(CKPT_DIR, exist_ok=True)
os.makedirs(EDGE_DIR, exist_ok=True)

DROP_COLS = ['frame.time','ip.src_host','ip.dst_host','Attack_label','Attack_type']
FEATURE_COLS = ['arp.dst.proto_ipv4','arp.opcode','arp.hw.size','arp.src.proto_ipv4','icmp.checksum',
 'icmp.seq_le','icmp.transmit_timestamp','icmp.unused','http.file_data','http.content_length',
 'http.request.uri.query','http.request.method','http.referer','http.request.full_uri',
 'http.request.version','http.response','http.tls_port','tcp.ack','tcp.ack_raw','tcp.checksum',
 'tcp.connection.fin','tcp.connection.rst','tcp.connection.syn','tcp.connection.synack','tcp.dstport',
 'tcp.flags','tcp.flags.ack','tcp.len','tcp.seq','tcp.srcport','udp.port','udp.stream','udp.time_delta',
 'dns.qry.name','dns.qry.name.len','dns.qry.qu','dns.qry.type','dns.retransmission',
 'dns.retransmit_request','dns.retransmit_request_in','mqtt.conflag.cleansess','mqtt.conflags',
 'mqtt.hdrflags','mqtt.len','mqtt.msg_decoded_as','mqtt.msgtype','mqtt.proto_len','mqtt.topic_len',
 'mqtt.ver','mbtcp.len','mbtcp.trans_id','mbtcp.unit_id']

CLASS_ORDER = ['Normal','DDoS_UDP','DDoS_ICMP','SQL_injection','Password','Vulnerability_scanner',
               'DDoS_TCP','DDoS_HTTP','Uploading','Backdoor','Port_Scanning','XSS','Ransomware',
               'MITM','Fingerprinting']
class_to_idx = {c:i for i,c in enumerate(CLASS_ORDER)}
CAP_PER_CLASS = 15000
W = 10
STRIDE = 2
SMOTE_TARGET = 6000

def clean_features(df):
    df = df.copy()
    for col in FEATURE_COLS:
        df[col] = pd.to_numeric(df[col], errors='coerce')
        fm = df.loc[np.isfinite(df[col]), col].max()
        fm = fm if pd.notna(fm) else 0.0
        df[col] = df[col].replace([np.inf, -np.inf], fm).fillna(0)
        df[col] = np.log10(1 + df[col].clip(lower=0))
    df[FEATURE_COLS] = MinMaxScaler().fit_transform(df[FEATURE_COLS])
    return df

def make_windows_within_class(df, w=W, stride=STRIDE):
    all_X, all_y = [], []
    for cls, grp in df.groupby('y'):
        X = grp[FEATURE_COLS].values.astype('float32'); n = len(X)
        if n < w: continue
        n_windows = (n - w) // stride + 1
        Xs = np.empty((n_windows, w, len(FEATURE_COLS)), dtype='float32')
        for i, s in enumerate(range(0, n - w + 1, stride)):
            Xs[i] = X[s:s+w]
        all_X.append(Xs); all_y.append(np.full(n_windows, cls))
    if not all_X: return np.empty((0,w,len(FEATURE_COLS)),dtype='float32'), np.empty((0,),dtype=int)
    return np.concatenate(all_X), np.concatenate(all_y)

# ---- Step 1: build a capped working matrix from the raw CSV, chunk by chunk ----
wm_path = f'{EDGE_DIR}/working_matrix.csv'
if not os.path.exists(wm_path):
    counts_so_far = {c: 0 for c in CLASS_ORDER}
    chunks_out = []
    for chunk in pd.read_csv(DNN_PATH, usecols=['Attack_type'] + FEATURE_COLS, chunksize=200_000, low_memory=False):
        for cls in CLASS_ORDER:
            if counts_so_far[cls] >= CAP_PER_CLASS: continue
            sub = chunk[chunk['Attack_type'] == cls]
            need = CAP_PER_CLASS - counts_so_far[cls]
            if len(sub) > need:
                sub = sub.sample(n=need, random_state=42)
            counts_so_far[cls] += len(sub)
            if len(sub) > 0:
                chunks_out.append(sub)
        print(f"Running totals: {counts_so_far}")
    wm = pd.concat(chunks_out, ignore_index=True)
    wm['y'] = wm['Attack_type'].map(class_to_idx)
    wm.to_csv(wm_path, index=False)
    print(f"Working matrix built: {len(wm)} rows")
else:
    wm = pd.read_csv(wm_path)
    print(f"Working matrix reloaded: {len(wm)} rows")

rng = np.random.default_rng(42)
shard_ids = np.zeros(len(wm), dtype=int)
for cls, grp in wm.groupby('y'):
    idx = grp.index.values
    shard_ids[wm.index.get_indexer(idx)] = rng.integers(0, 7, size=len(idx))
wm['shard'] = shard_ids

# Held out 20% of raw rows (by index) BEFORE any client sees them, so test set is untouched by SMOTE
train_idx, test_idx = train_test_split(wm.index.values, test_size=0.20, stratify=wm['y'], random_state=42)
wm_train = wm.loc[train_idx].reset_index(drop=True)
wm_test_raw = wm.loc[test_idx].reset_index(drop=True)

def preprocess_client(df, client_name=""):
    df = clean_features(df)
    Xw, yw = make_windows_within_class(df)
    if len(Xw) > 0:
        n_,w_,f_ = Xw.shape; Xf = Xw.reshape(n_, w_*f_)
        counts = np.bincount(yw, minlength=len(CLASS_ORDER))
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

clients = list(range(7))
for c in clients:
    out_path = f"{EDGE_DIR}/client_{c}.npz"
    if os.path.exists(out_path):
        print(f"  Client {c}: already prepped, skipping"); continue
    Xw, yw = preprocess_client(wm_train[wm_train['shard']==c], client_name=c)
    np.savez_compressed(out_path, X=Xw, y=yw)
    del Xw, yw; gc.collect()
print("All 7 clients prepped")

wm_test_clean = clean_features(wm_test_raw)
X_test, y_test = make_windows_within_class(wm_test_clean, stride=1)
print(f"Test set: {X_test.shape[0]} windows, classes: {sorted(set(y_test))}")
del wm, wm_train, wm_test_raw, wm_test_clean; gc.collect()

def build_model():
    inp = layers.Input(shape=(W, len(FEATURE_COLS)))
    x = layers.Conv1D(64, 1, padding='same', activation='relu')(inp)
    x = layers.MaxPool1D()(x); x = layers.LSTM(64)(x)
    x = layers.Dense(32, activation='relu')(x)
    out = layers.Dense(len(CLASS_ORDER), activation='softmax')(x)
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
    print(f"Resuming from checkpoint: {last}")
weights = global_model.get_weights()

for rnd in range(start_round, R):
    local_ws = []
    for c in clients:
        data = np.load(f'{EDGE_DIR}/client_{c}.npz')
        Xw, yw = data['X'], data['y']
        if len(Xw) == 0: continue
        lm = build_model(); lm.set_weights(weights)
        lm.fit(Xw, yw, epochs=E, batch_size=64, verbose=0)
        local_ws.append(lm.get_weights())
        del lm, Xw, yw, data; gc.collect()
    weights = [np.mean([lw[i] for lw in local_ws], axis=0) for i in range(len(weights))]
    global_model.set_weights(weights)
    global_model.save_weights(f'{CKPT_DIR}/round_{rnd+1}.weights.h5')
    print(f"Round {rnd+1}/{R} done and checkpointed")

y_pred = np.argmax(global_model.predict(X_test), axis=1)
report = classification_report(y_test, y_pred, labels=list(range(len(CLASS_ORDER))), target_names=CLASS_ORDER, digits=2, zero_division=0, output_dict=True)
print(classification_report(y_test, y_pred, labels=list(range(len(CLASS_ORDER))), target_names=CLASS_ORDER, digits=2, zero_division=0))

print(f"\n=== SUMMARY FOR TABLE (Edge-IIoTset) ===")
print(f"Accuracy: {report['accuracy']*100:.2f}")
print(f"Weighted F1: {report['weighted avg']['f1-score']*100:.2f}")
print(f"Macro F1: {report['macro avg']['f1-score']*100:.2f}")
