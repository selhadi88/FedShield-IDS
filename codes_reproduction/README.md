# FedShield-IDS: Reproducibility Code

Code accompanying the paper *"Privacy-Preserving Intrusion Detection in IoT Smart Homes Using a
Federated Hybrid 1D-CNN–LSTM Model with Explainable AI"* (Scientific Reports, submission ID
2fbd59b7-2899-4e38-9e55-8d28a4b091de).

This repository contains the scripts used to independently rebuild the full experimental pipeline
from the raw CICIoT2023 corpus during the minor-revision process, and to produce every real
experimental result reported in the revised manuscript's tables.

## Data

- **CICIoT2023**: publicly available at https://www.unb.ca/cic/datasets/iotdataset-2023.html,
  or via the Kaggle mirror `akashdogra/ciciot23csv` (used in this workflow via `kagglehub`).
- **Edge-IIoTset**: Kaggle dataset `mohamedamineferrag/edgeiiotset-cyber-security-dataset-of-iot-iiot`.

Scripts were run in Google Colab with data cached to Google Drive between sessions
(`/content/drive/MyDrive/FedShield_data/`). Adjust paths if running in a different environment.

## Pipeline overview

The core pipeline (shared by all scripts): a 5-stage local preprocessing pipeline
(infinite/missing-value handling, log scaling, Min-Max normalization, temporal windowing,
localized SMOTE) applied independently per federated client, feeding a hybrid 1D-CNN–LSTM
(Conv1D, kernel size k=1, 64 filters → MaxPool1D → LSTM(64) → Dense(32) → Dense(8, softmax)),
trained via FedAvg. The 712,310-record working matrix is partitioned into 7 non-IID device-profile
shards (Camera, Smart Lock, Smart TV, Refrigerator, Thermostat, Blinds, Meter).

## Scripts (run in this order to reproduce the manuscript's tables)

| Script | Produces | Manuscript table |
|---|---|---|
| `01_fullscale_prep.py` | Preprocessed, SMOTE-balanced per-client `.npz` files | (input to all below) |
| `02_fullscale_train.py` | Baseline model (k=1, 7 clients, R=5) | Table 5 (results), baseline rows throughout |
| `03_kernel_ablation.py` | k=3, 5, 7 variants | Table 3 (kernel_ablation) |
| `04_architecture_ablation.py` | CNN-only, LSTM-only variants | Table 12 (arch_ablation) |
| `05_preprocessing_ablation.py` | w/o log, w/o Min-Max, w/o windowing, w/o SMOTE | Table 10 (prep_ablation) |
| `06_surrogate_fidelity.py` | Held-out-validated SHAP surrogate fidelity | Table 6 (fidelity) |
| `07_gate_threshold_sweep.py` | Mitigation-gate α sweep, 50 simulated trials | Table 4 (gate_sweep) |
| `08_scalability_rounds.py` | R=10, R=20 at M=7 (device-profile partition) | Table 16 Block A |
| `09_scalability_clients.py` | M=10, 20, 50 at R=5 (random-by-class partition) | Table 16 Block B |
| `10_edgeiiot_inspect.py` | Column/label inspection for Edge-IIoTset | (setup for #11) |
| `11_edgeiiot_crossdataset.py` | Full cross-dataset pipeline on Edge-IIoTset | Table 13 (crossdataset) |
| `12_smote_after_distribution.py` | Post-SMOTE class balance (uses output of #01) | Table 9 (smote) |

Each script is parameterized at the top (a single variable, e.g. `KERNEL_SIZE`, `SKIP_STAGE`,
`ARCH`, `M`) — re-run with different values for each row of the corresponding table. All training
scripts checkpoint per federated round to Google Drive and automatically resume from the last
completed round if interrupted.

## Requirements

See `requirements.txt`. Developed and run in Google Colab (Python 3.12, TensorFlow 2.x, T4/L4 GPU).

## Notes on methodology corrections made during revision

Two issues were identified and corrected while rebuilding this pipeline, documented here for
transparency (see also the manuscript's Section 5.9 and the point-by-point response to reviewers):

1. **Window labeling**: windows built from majority vote across arbitrary row adjacency degenerate
   toward the single most frequent class. Fixed by constructing windows from temporally consecutive
   rows of the *same* class only (`make_windows_within_class` in each script).
2. **Data capping**: capping each client's *total* row budget (rather than capping per class)
   disproportionately shrinks already-rare classes. Fixed by capping only classes above a per-class
   ceiling, leaving minority-class data untouched (`cap_per_class` in each script).
