"""
Corrected hybrid 1D-CNN-LSTM architecture, matching the model actually used to produce
the results in the manuscript (see ../paper_reproduction/02_fullscale_train.py).

This REPLACES the previous model_arch.py, which defined a binary (Benign vs. Attack)
classifier -- inconsistent with the paper's 8-class claims. flower_client.py should
import create_hybrid_model from this file instead.

IMPORTANT -- class order mismatch with the dashboard:
  This model outputs classes in the order used throughout paper_reproduction/:
    ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
  backend/main.py's ATTACK_FAMILIES list uses a different (alphabetical) order:
    ['BENIGN','DDOS','DOS','INJECTION','MALWARE','MIRAI','RECON','SPOOFING']
  If you load a model trained with this architecture into the dashboard backend,
  remap softmax output indices using CLASS_ORDER_TO_ATTACK_FAMILIES_INDEX below
  before displaying predictions, or predictions will be correctly classified but
  incorrectly LABELED.
"""

import tensorflow as tf
from tensorflow.keras import layers, models

CLASS_ORDER = ['Benign', 'DDoS', 'DoS', 'Mirai', 'Reconnaissance', 'Spoofing', 'Injection', 'Malware']
ATTACK_FAMILIES = ['BENIGN', 'DDOS', 'DOS', 'INJECTION', 'MALWARE', 'MIRAI', 'RECON', 'SPOOFING']

# Maps an index in CLASS_ORDER's output vector to the corresponding index in ATTACK_FAMILIES
_name_map = {
    'Benign': 'BENIGN', 'DDoS': 'DDOS', 'DoS': 'DOS', 'Mirai': 'MIRAI',
    'Reconnaissance': 'RECON', 'Spoofing': 'SPOOFING', 'Injection': 'INJECTION', 'Malware': 'MALWARE',
}
CLASS_ORDER_TO_ATTACK_FAMILIES_INDEX = [ATTACK_FAMILIES.index(_name_map[c]) for c in CLASS_ORDER]


def create_hybrid_model(window_size=10, n_features=39, kernel_size=1, num_classes=8):
    """
    Hybrid 1D-CNN-LSTM: Conv1D(64, kernel_size) -> MaxPool1D -> LSTM(64) -> Dense(32) -> Dense(num_classes, softmax).
    Defaults match the manuscript (Section 3.2): kernel_size=1 (pointwise convolution,
    justified in Section 3.2.1 and Table 3's kernel-size ablation), n_features=39 for
    CICIoT2023 (use n_features=52 for Edge-IIoTset, see paper_reproduction/11_edgeiiot_crossdataset.py).
    """
    inp = layers.Input(shape=(window_size, n_features))
    x = layers.Conv1D(64, kernel_size, padding='same', activation='relu')(inp)
    x = layers.MaxPool1D()(x)
    x = layers.LSTM(64)(x)
    x = layers.Dense(32, activation='relu')(x)
    out = layers.Dense(num_classes, activation='softmax')(x)
    model = models.Model(inp, out)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )
    return model
