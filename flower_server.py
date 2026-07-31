import flwr as fl
import sys
import numpy as np

class SaveModelStrategy(fl.server.strategy.FedAvg):
    def aggregate_fit(self, server_round, results, failures):
        # Perform standard FedAvg aggregation
        aggregated_parameters, aggregated_metrics = super().aggregate_fit(server_round, results, failures)
        
        # Save the global weights to an NPZ file
        if aggregated_parameters is not None:
            aggregated_ndarrays = fl.common.parameters_to_ndarrays(aggregated_parameters)
            np.savez(f"round-{server_round}-weights.npz", *aggregated_ndarrays)
            print(f"[*] Successfully saved global weights to round-{server_round}-weights.npz!")
            
        return aggregated_parameters, aggregated_metrics

def main():
    # 1. Define the Custom Save Strategy
    strategy = SaveModelStrategy(
        fraction_fit=1.0,          
        fraction_evaluate=1.0,     
        min_fit_clients=3,         
        min_evaluate_clients=3,    
        min_available_clients=3,   
    )

    # 2. Start the Flower Server
    print("🚀 [SERVER] Starting Federated Learning Aggregator...")
    fl.server.start_server(
        server_address="0.0.0.0:8081",
        # We only need 1 round since the previous nodes already converged, or 5 if they prefer.
        # Running 1 round to instantly jumpstart the capture.
        config=fl.server.ServerConfig(num_rounds=1), 
        strategy=strategy,
    )

if __name__ == "__main__":
    main()