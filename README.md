# FedShield-IDS

Code accompanying the paper *"Privacy-Preserving Intrusion Detection in IoT Smart Homes Using a
Federated Hybrid 1D-CNN–LSTM Model with Explainable AI"* (Scientific Reports, submission ID
2fbd59b7-2899-4e38-9e55-8d28a4b091de).

This repository has two parts, kept clearly separate because they are not currently synchronized
with each other — see "Status" below before assuming otherwise.

## `codes_reproduction/`

The scripts that produced every experimental result reported in the manuscript's tables (kernel,
architecture, and preprocessing ablations; surrogate fidelity; mitigation-gate threshold sweep;
scalability; cross-dataset evaluation on Edge-IIoTset). **This is the authoritative code for
reproducing the paper.** See `codes_reproduction/README.md` for details and run order.

## `dashboard_demo/`

A real-time SOC (Security Operations Center) dashboard: a Next.js frontend visualizing live traffic,
SHAP feature attributions, and an interactive mitigation-gate sensitivity slider, backed by a FastAPI
server (`backend/main.py`) with WebSocket streaming, plus Flower-based federated orchestration
scaffolding (`flower_client.py`, `flower_server.py`).

### Status — please read before running

The dashboard backend (`backend/main.py`) is written expecting an 8-class model (`ATTACK_FAMILIES`
has 8 entries), consistent with the paper. However:

1. **`model_arch.py` in this folder has been corrected** to match the architecture actually used
   in `codes_reproduction/` (previously it defined a binary Benign-vs-Attack classifier, which is
   inconsistent with the paper and was not used to produce any reported result).
2. **The dashboard backend's class order differs from `codes_reproduction/`'s.** `main.py` uses
   alphabetical order (`BENIGN, DDOS, DOS, INJECTION, MALWARE, MIRAI, RECON, SPOOFING`);
   `codes_reproduction/` uses `Benign, DDoS, DoS, Mirai, Reconnaissance, Spoofing, Injection,
   Malware`. A model trained with `codes_reproduction/`'s scripts must have its output indices
   remapped before being loaded into the dashboard, or predictions will be correctly classified
   but incorrectly labeled in the UI. A ready-made mapping is provided as
   `CLASS_ORDER_TO_ATTACK_FAMILIES_INDEX` in `model_arch.py`.
3. **No model file is currently bundled in this repository.** To power the dashboard with the
   real, paper-reported model, run `codes_reproduction/01_fullscale_prep.py` and
   `02_fullscale_train.py`, then load the resulting model into `backend/main.py` (currently
   configured to load `iot_defense_model.h5` by relative path) applying the index remapping above.

In short: the dashboard is a real, functioning demonstration system, and the experimental results
in the paper are real and independently reproducible — but as of this repository snapshot, the two
have not yet been wired together end-to-end. We are noting this explicitly rather than presenting
an integration that does not yet exist.

## License / citation

See the manuscript for citation details. Contact the corresponding author (Ghada Abdelhady,
gabdelmouez@msa.edu.eg) with questions.
