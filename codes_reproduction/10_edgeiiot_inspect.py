import kagglehub
path = kagglehub.dataset_download("mohamedamineferrag/edgeiiot-dataset")
print("Downloaded to:", path)

import glob, os
all_files = glob.glob(os.path.join(path, "**/*.csv"), recursive=True)
print(f"\nFound {len(all_files)} CSV files:")
for f in all_files:
    print(" ", f)
