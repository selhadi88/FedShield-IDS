import torch
import shap
import numpy as np

class XAIExplainer:
    def __init__(self, model, background_data):
        """
        Initializes the SHAP Explainer for the IoT Defense Model.
        
        Args:
            model (torch.nn.Module): The trained IoTHybridDefense model.
            background_data (torch.Tensor): A baseline tensor representing typical network traffic, 
                                            used by SHAP for calculating expected gradients.
                                            Expected shape: (N, sequence_length, 47)
        """
        self.model = model
        self.model.eval()
        
        # GradientExplainer is robust for PyTorch models that include recurrent 
        # architectures like LSTMs, and supports continuous input flows.
        self.explainer = shap.GradientExplainer(self.model, background_data)

    def explain_anomaly(self, input_tensor, feature_names):
        """
        Computes SHAP feature importance to explain an 'Attack' prediction.
        
        Args:
            input_tensor (torch.Tensor): The individual input sequence.
                                         Expected shape: (1, sequence_length, 47)
            feature_names (list): List of 47 feature name strings.
            
        Returns:
            list[dict]: A JSON-serializable list mapping the top 5 contributing features 
                        to their absolute calculated importance weights.
        """
        # Ensure the target tensor can receive gradients for backpropagation
        if not input_tensor.requires_grad:
            input_tensor = input_tensor.clone().requires_grad_(True)
            
        # Computes SHAP values
        # shap_values represents the contribution of each feature to the final prediction
        shap_values = self.explainer.shap_values(input_tensor)
        
        # Standardize the SHAP payload extraction because shap arrays depend on the internal 
        # classification setup (binary vs multiclass).
        if isinstance(shap_values, list):
            shap_values = shap_values[0] # Focus on the active logit list
            
        if torch.is_tensor(shap_values):
            shap_array = shap_values.detach().cpu().numpy()
        else:
            shap_array = np.array(shap_values)
            
        # The resulting shape is [1, sequence_length, 47].
        # We find the global feature importance by averaging the absolute SHAP weights 
        # across the sequence dimension (axis=1) and the single batch dimension (axis=0).
        feature_importance = np.mean(np.abs(shap_array), axis=(0, 1))
        
        # Find the indices of the highest 5 weights and map them
        top_5_indices = np.argsort(feature_importance)[-5:][::-1]
        
        # Format explicitly for JSON-serialization over FastAPI
        explanation = []
        for idx in top_5_indices:
            explanation.append({
                "feature": feature_names[idx],
                "weight": float(feature_importance[idx])  # Forced float serialization
            })
            
        return explanation
