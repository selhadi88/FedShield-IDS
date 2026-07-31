import numpy as np

DATA_DIR = '/content/drive/MyDrive/FedShield_data'
CLASS_ORDER = ['Benign','DDoS','DoS','Mirai','Reconnaissance','Spoofing','Injection','Malware']
clients = ['Blinds','Refrigerator','Meter','Thermostat','Camera','Smart_Lock','Smart_TV']

total_counts = np.zeros(8, dtype=int)
for c in clients:
    data = np.load(f'{DATA_DIR}/client_{c}.npz')
    y = data['y']
    counts = np.bincount(y, minlength=8)
    total_counts += counts

total = total_counts.sum()
print("=== Post-SMOTE class distribution (aggregated across all 7 clients) ===")
for cls, cnt in zip(CLASS_ORDER, total_counts):
    print(f"{cls:16s} {cnt:>8,}  {cnt/total*100:6.2f}%")
print(f"{'Total':16s} {total:>8,}  100.00%")
