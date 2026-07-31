import os
import argparse
import numpy as np
import pandas as pd
import tensorflow as tf
import flwr as fl

from model_arch import create_hybrid_model

class FDLClient(fl.client.NumPyClient):
    def __init__(self, model, X_train, y_train, X_test, y_test):
        self.model = model
        self.X_train = X_train
        self.y_train = y_train
        self.X_test = X_test
        self.y_test = y_test
        self.epsilon = 1.0  # Total privacy budget per communication round
        self.sensitivity = 0.01  # Sensitivity bound for local weight delta modifications

    def _apply_dp_noise(self, weights):
        """Applies Local Differential Privacy Laplacian noise to model weights."""
        noisy_weights = []
        scale = self.sensitivity / self.epsilon
        perturbed_weights = [w + np.random.laplace(0, scale, size=w.shape) for w in weights]
        return perturbed_weights

    def get_parameters(self, config):
        """Returns the current local model weights with DP noise applied."""
        return self._apply_dp_noise(self.model.get_weights())

    def fit(self, parameters, config):
        """Receives global model weights, updates local model, and trains."""
        self.model.set_weights(parameters)
        
        # Dynamic configuration from the FL server (fallback to 1 epoch, bs 32)
        epochs = config.get("epochs", 1)
        batch_size = config.get("batch_size", 32)
        
        print(f"\n[+] Local Training Round Started (Epochs: {epochs}, Batch Size: {batch_size})")
        history = self.model.fit(
            self.X_train, self.y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.1,
            verbose=1
        )
        
        # Package and return learning metrics alongside updated weights
        results = {
            "loss": history.history["loss"][-1],
            "accuracy": history.history["accuracy"][-1],
        }
        return self._apply_dp_noise(self.model.get_weights()), len(self.X_train), results

    def evaluate(self, parameters, config):
        """Evaluates the global model weights against the local test dataset."""
        self.model.set_weights(parameters)
        print("[+] Evaluating global aggregate on local test set...")
        loss, accuracy = self.model.evaluate(self.X_test, self.y_test, verbose=0)
        return float(loss), len(self.X_test), {"accuracy": float(accuracy)}


def load_node_data(node_dir):
    """
    Loads data for a specific node from train.csv and test.csv.
    """
    train_path = os.path.join(node_dir, 'train.csv')
    test_path = os.path.join(node_dir, 'test.csv')
    
    if os.path.exists(train_path) and os.path.exists(test_path):
        train_df = pd.read_csv(train_path)
        test_df = pd.read_csv(test_path)
    else:
        # Fallback in case only processed_data.csv exists
        print(f"Fallback: loading from {os.path.join(node_dir, 'processed_data.csv')}")
        from sklearn.model_selection import train_test_split
        df = pd.read_csv(os.path.join(node_dir, 'processed_data.csv'))
        train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)
        
    X_train = train_df.drop('label', axis=1).values
    y_train = train_df['label'].values
    
    X_test = test_df.drop('label', axis=1).values
    y_test = test_df['label'].values
    
    # Note on Reshaping requested (X, features) -> (X, 1, features):
    # Our `model_arch.py` contains `Reshape((1, input_dim))` explicitly inside the sequential logic!
    # Because the model definition handles it internally on the GPU graph, 
    # we leave the data flat and natively pass 2D arrays so Keras doesn't raise a rank dimensionality exception.
    
    return X_train, y_train, X_test, y_test


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flower Federated Learning Edge Client")
    parser.add_argument("--node", type=str, required=True, help="Node folder to source data (e.g., 'node_1')")
    parser.add_argument("--server", type=str, default="127.0.0.1:8081", help="Address of the Flower server")
    args = parser.parse_args()

    node_dir = os.path.join('data', 'federated', args.node)
    
    print(f"--- FDL Client Startup: {args.node.upper()} ---")
    if not os.path.exists(node_dir):
        print(f"[-] FATAL: Node directory {node_dir} does not exist!")
        exit(1)
        
    X_train, y_train, X_test, y_test = load_node_data(node_dir)
    print(f"[+] Dataset Loaded. Train Size: {len(X_train)}  Test Size: {len(X_test)}")
    
    # 1. Initialize Hybrid Model Architecture dynamically depending on feature column count
    input_dim = X_train.shape[1]
    model = create_hybrid_model(input_dim)
    
    # 2. Instantiate Flower NumPyClient
    client = FDLClient(model, X_train, y_train, X_test, y_test)
    
    # 3. Connect to Aggregation Server
    print(f"[+] Handshaking with Flower Federation Server at {args.server}...")
    try:
        if hasattr(fl.client, 'start_client'):
            # Modern 1.5+ flwr api format
            fl.client.start_client(server_address=args.server, client=client.to_client())
        else:
            # Fallback for earlier versions
            fl.client.start_numpy_client(server_address=args.server, client=client)
    except Exception as e:
        print(f"[-] Client connection closed or failed: {e}")
