"""
Chatbot Trainer using Sentence Transformers and FAISS
Creates a semantic search index for VTU course materials
"""
import json
import pickle
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import logging
from sentence_transformers import SentenceTransformer
import faiss

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VTUChatbotTrainer:
    """Train chatbot using sentence embeddings and FAISS index"""
    
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """
        Initialize the trainer
        Args:
            model_name: Name of the sentence transformer model
        """
        logger.info(f"Loading sentence transformer model: {model_name}")
        self.model = SentenceTransformer(model_name)
        self.index = None
        self.data = []
        self.embeddings = None
        
    def load_data(self, data_file: str = "processed_data.json") -> List[Dict]:
        """Load processed data from JSON file"""
        data_path = Path(data_file)
        
        if not data_path.exists():
            raise FileNotFoundError(f"Data file {data_file} not found. Run data_processor.py first.")
        
        with open(data_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        
        logger.info(f"Loaded {len(self.data)} data chunks")
        return self.data
    
    def create_embeddings(self) -> np.ndarray:
        """Create embeddings for all text chunks"""
        if not self.data:
            raise ValueError("No data loaded. Call load_data() first.")
        
        texts = [item['text'] for item in self.data]
        
        logger.info(f"Creating embeddings for {len(texts)} text chunks...")
        self.embeddings = self.model.encode(
            texts,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        
        logger.info(f"Embeddings created with shape: {self.embeddings.shape}")
        return self.embeddings
    
    def build_faiss_index(self):
        """Build FAISS index for fast similarity search"""
        if self.embeddings is None:
            raise ValueError("No embeddings found. Call create_embeddings() first.")
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(self.embeddings)
        
        # Create FAISS index
        dimension = self.embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dimension)  # Inner Product for cosine similarity
        self.index.add(self.embeddings)
        
        logger.info(f"FAISS index built with {self.index.ntotal} vectors")
    
    def save_model(self, output_dir: str = "trained_model"):
        """Save the trained model, index, and data"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Save FAISS index
        index_path = output_path / "faiss_index.bin"
        faiss.write_index(self.index, str(index_path))
        logger.info(f"FAISS index saved to {index_path}")
        
        # Save data
        data_path = output_path / "training_data.pkl"
        with open(data_path, 'wb') as f:
            pickle.dump(self.data, f)
        logger.info(f"Training data saved to {data_path}")
        
        # Save embeddings
        embeddings_path = output_path / "embeddings.npy"
        np.save(embeddings_path, self.embeddings)
        logger.info(f"Embeddings saved to {embeddings_path}")
        
        # Save metadata
        metadata = {
            'model_name': self.model.get_sentence_embedding_dimension(),
            'num_chunks': len(self.data),
            'embedding_dimension': self.embeddings.shape[1]
        }
        metadata_path = output_path / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Metadata saved to {metadata_path}")
        
        return output_path
    
    def train(self, data_file: str = "processed_data.json", output_dir: str = "trained_model"):
        """Complete training pipeline"""
        logger.info("Starting training pipeline...")
        
        # Load data
        self.load_data(data_file)
        
        # Create embeddings
        self.create_embeddings()
        
        # Build FAISS index
        self.build_faiss_index()
        
        # Save model
        output_path = self.save_model(output_dir)
        
        logger.info(f"Training complete! Model saved to {output_path}")
        return output_path


class TrainedChatbot:
    """Chatbot that uses trained model for answering questions"""
    
    def __init__(self, model_dir: str = "trained_model", model_name: str = 'all-MiniLM-L6-v2'):
        """Load trained model"""
        self.model_dir = Path(model_dir)
        self.model = SentenceTransformer(model_name)
        
        # Load FAISS index
        index_path = self.model_dir / "faiss_index.bin"
        if not index_path.exists():
            raise FileNotFoundError(f"Model not found at {model_dir}. Train the model first.")
        
        self.index = faiss.read_index(str(index_path))
        logger.info(f"Loaded FAISS index with {self.index.ntotal} vectors")
        
        # Load training data
        data_path = self.model_dir / "training_data.pkl"
        with open(data_path, 'rb') as f:
            self.data = pickle.load(f)
        logger.info(f"Loaded {len(self.data)} training data chunks")
    
    def search(self, query: str, top_k: int = 5, threshold: float = 0.3) -> List[Dict]:
        """
        Search for relevant content
        Args:
            query: User question
            top_k: Number of top results to return
            threshold: Minimum similarity score (0-1)
        Returns:
            List of relevant chunks with metadata
        """
        # Create query embedding
        query_embedding = self.model.encode([query], convert_to_numpy=True)
        faiss.normalize_L2(query_embedding)
        
        # Search in FAISS index
        scores, indices = self.index.search(query_embedding, top_k)
        
        # Filter by threshold and prepare results
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if score >= threshold:
                result = self.data[idx].copy()
                result['similarity_score'] = float(score)
                results.append(result)
        
        return results
    
    def get_answer(self, query: str, top_k: int = 3, threshold: float = 0.3) -> Tuple[Optional[str], List[Dict]]:
        """
        Get answer from trained data
        Args:
            query: User question
            top_k: Number of top results to consider
            threshold: Minimum similarity score
        Returns:
            Tuple of (answer_text, sources)
        """
        results = self.search(query, top_k, threshold)
        
        if not results:
            return None, []
        
        # Combine top results
        answer_parts = []
        sources = []
        
        for i, result in enumerate(results):
            answer_parts.append(result['text'])
            sources.append({
                'subject': result['subject'],
                'filename': result['filename'],
                'score': result['similarity_score']
            })
        
        # Combine answers
        combined_answer = "\n\n".join(answer_parts)
        
        return combined_answer, sources


def main():
    """Main training function"""
    print("\n" + "="*60)
    print("VTU Chatbot Training System")
    print("="*60 + "\n")
    
    # Initialize trainer
    trainer = VTUChatbotTrainer()
    
    # Train the model
    try:
        output_path = trainer.train(
            data_file="processed_data.json",
            output_dir="trained_model"
        )
        
        print("\n" + "="*60)
        print("Training Summary")
        print("="*60)
        print(f"✓ Model saved to: {output_path}")
        print(f"✓ Total chunks indexed: {len(trainer.data)}")
        print(f"✓ Embedding dimension: {trainer.embeddings.shape[1]}")
        
        # Get unique subjects
        subjects = set(item['subject'] for item in trainer.data)
        print(f"✓ Subjects covered: {', '.join(subjects)}")
        print("="*60 + "\n")
        
        # Test the model
        print("Testing the trained model...\n")
        chatbot = TrainedChatbot("trained_model")
        
        test_queries = [
            "What is Big Data?",
            "Explain cloud computing",
            "What is Django framework?"
        ]
        
        for query in test_queries:
            print(f"Q: {query}")
            answer, sources = chatbot.get_answer(query, top_k=2, threshold=0.2)
            if answer:
                print(f"A: Found {len(sources)} relevant sources")
                for src in sources:
                    print(f"   - {src['subject']}: {src['filename']} (score: {src['score']:.3f})")
            else:
                print("A: No relevant information found")
            print()
        
    except FileNotFoundError as e:
        print(f"\nError: {e}")
        print("Please run data_processor.py first to process the PDF files.")
    except Exception as e:
        print(f"\nError during training: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
