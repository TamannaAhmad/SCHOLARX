import os
import logging
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
import pickle
import google.generativeai as genai
from django.conf import settings

# Configure Gemini
GEMINI_API_KEY = getattr(settings, 'GEMINI_API_KEY', None)
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    GEMINI_AVAILABLE = True
else:
    GEMINI_AVAILABLE = False
    logging.warning("GEMINI_API_KEY not found in settings. Gemini formatting will be disabled.")

logger = logging.getLogger(__name__)

class ChatbotService:
    """Service to handle chatbot operations using the trained model"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ChatbotService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        self.model = None
        self.index = None
        self.data = None
        self.available = False
        self.gemini_model = None
        
        try:
            # Initialize Gemini if API key is available
            if GEMINI_AVAILABLE:
                try:
                    self.gemini_model = genai.GenerativeModel('gemini-2.5-flash')
                    logger.info("Using Gemini 2.5 Flash model")
                except Exception as e:
                    logger.error(f"Error initializing model: {e}")
                    # Fall back to gemini-pro if 2.5-flash is not available
                    try:
                        self.gemini_model = genai.GenerativeModel('gemini-pro')
                        logger.info("Falling back to gemini-pro model")
                    except Exception as e2:
                        logger.error(f"Failed to initialize Gemini model: {str(e2)}")
            
            # Path to the trained model directory
            model_dir = Path("c:/Users/gryff/Documents/projects/SCHOLARX/chatbot/trained_model")
            logger.info(f"Looking for model in: {model_dir.absolute()}")
            logger.info(f"Directory exists: {model_dir.exists()}")
            if model_dir.exists():
                logger.info(f"Contents of model directory: {list(model_dir.glob('*'))}")
            
            # Load FAISS index
            index_path = model_dir / "faiss_index.bin"
            logger.info(f"Looking for FAISS index at: {index_path}")
            if not index_path.exists():
                logger.error(f"FAISS index not found at {index_path}")
                # List all files in the directory to help with debugging
                logger.error(f"Available files in directory: {[f.name for f in model_dir.glob('*')]}")
                return
                
            # Load training data
            data_path = model_dir / "training_data.pkl"
            if not data_path.exists():
                logger.error(f"Training data not found at {data_path}")
                return
                
            # Initialize model
            self.model = SentenceTransformer('all-MiniLM-L6-v2')
            self.index = faiss.read_index(str(index_path))
            
            with open(data_path, 'rb') as f:
                self.data = pickle.load(f)
                
            self.available = True
            logger.info("Chatbot service initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing ChatbotService: {str(e)}", exc_info=True)
            self.available = False
        
        self._initialized = True
        
    def format_with_gemini(self, query: str, raw_answer: str) -> str:
        """Format the answer using Gemini for better readability."""
        if not self.gemini_model:
            return raw_answer
            
        try:
            prompt = f"""You are a helpful VTU (Visvesvaraya Technological University) assistant.

Format the following answer in a clear, educational way. The answer is from course materials, so maintain accuracy while improving clarity.

IMPORTANT INSTRUCTIONS:
- DO NOT use any markdown symbols like #, *, **, or any other formatting characters
- Use plain text only
- Use double line breaks between paragraphs
- Use single line breaks for list items
- Keep responses concise but well-structured

Question: {query}

Raw Answer:
{raw_answer}

Please format this response with:
1. Clear section headers on their own line (no symbols, UPPERCASE is fine)
2. Use simple dashes for bullet points
3. Add blank lines between sections
4. Keep paragraphs to 3-5 lines maximum
5. Use proper spacing and indentation for code examples
6. Ensure all line breaks are preserved in the output

Example of desired format:

SECTION HEADER

Main point 1
- Supporting detail
- Another detail

Main point 2
- More details here
- Additional information

Formatted Answer:"""
            
            response = self.gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Error formatting with Gemini: {str(e)}")
            return raw_answer  # Return original if formatting fails
            
    def get_gemini_fallback(self, query: str) -> Tuple[str, List[Dict], bool]:
        """Get a fallback answer from Gemini when no relevant results are found."""
        if not self.gemini_model:
            return "I'm sorry, I couldn't find a relevant answer to your question. Could you please rephrase or ask something else?", [], False
            
        try:
            prompt = f"""You are a helpful VTU (Visvesvaraya Technological University) assistant.
            
            A student asked: "{query}"
            
            No relevant information was found in the course materials. Please provide a helpful, educational response that:
            1. Acknowledges the lack of specific course material
            2. Provides general information about the topic if possible
            3. Suggests where the student might find more information
            4. Maintains a helpful, professional tone
            
            Response:"""
            
            response = self.gemini_model.generate_content(prompt)
            return response.text, [{
                'text': response.text,
                'score': 0.0,
                'metadata': {'source': 'Gemini AI'}
            }], True
        except Exception as e:
            logger.error(f"Error getting Gemini fallback: {str(e)}")
            return "I'm sorry, I couldn't find a relevant answer to your question. Could you please rephrase or ask something else?", [], False
    
    def format_answer(self, results: List[dict]) -> Tuple[str, List[dict]]:
        """Format the answer in a more readable way."""
        if not results:
            return "", []
            
        # Initialize variables to store the formatted answer and sources
        formatted_answer = []
        sources = []
        
        # Add a header for the answer
        formatted_answer.append("### 📚 Here's what I found:\n")
        
        # Process each result
        for i, result in enumerate(results, 1):
            # Get the text and clean it up
            text = result.get('text', '').strip()
            if not text:
                continue
                
            # Get the subject and filename for the source
            subject = result.get('subject', 'Unknown Subject')
            filename = result.get('filename', 'Unknown File')
            score = result.get('score', 0)
            
            # Format the answer part
            formatted_answer.append(f"**Source {i}** (Relevance: {score:.1%}):\n")
            formatted_answer.append(f"{text}\n")
            
            # Add source information
            sources.append({
                'text': text,
                'score': score,
                'metadata': {
                    'subject': subject,
                    'filename': filename,
                    'relevance': f"{score:.1%}"
                }
            })
        
        # Add a footer
        if formatted_answer:
            formatted_answer.append("\n---\n")
            formatted_answer.append("*Note: The information above is extracted from course materials. "
                                 "For official information, please refer to VTU's official resources.*")
        
        return "\n".join(formatted_answer), sources
    
    def get_answer(self, query: str, top_k: int = 5, threshold: float = 0.25) -> Tuple[Optional[str], List[dict], bool]:
        """
        Get answer from the trained model with formatted output
        
        Args:
            query: User's question
            top_k: Number of top results to return
            threshold: Minimum similarity score (0-1)
            
        Returns:
            Tuple of (formatted_answer, sources, found)
        """
        logger.info(f"Getting answer for query: {query}")
        
        if not self.available or not self.model or not self.index or not self.data:
            logger.error("Chatbot service not properly initialized")
            # Try Gemini fallback if available
            if GEMINI_AVAILABLE:
                logger.info("Service not available, trying Gemini fallback")
                return self.get_gemini_fallback(query)
            return None, [], False
            
        try:
            # Encode the query
            query_embedding = self.model.encode([query])
            
            # Search the index
            D, I = self.index.search(query_embedding, top_k)
            
            # Get results above threshold
            results = []
            for dist, idx in zip(D[0], I[0]):
                similarity = float(1.0 - dist)
                if similarity >= threshold:
                    try:
                        result = dict(self.data[idx])
                        result['score'] = similarity
                        results.append(result)
                    except Exception as e:
                        logger.error(f"Error processing result: {str(e)}")
            
            logger.info(f"Found {len(results)} results above threshold {threshold}")
            
            if not results:
                # No results found, try Gemini fallback
                if GEMINI_AVAILABLE:
                    logger.info("No results found, trying Gemini fallback")
                    return self.get_gemini_fallback(query)
                return None, [], False
                
            # Format the answer with sources
            formatted_answer, sources = self.format_answer(results)
            
            # If Gemini is available, use it to format the answer for better readability
            if GEMINI_AVAILABLE:
                try:
                    # Combine all result texts for Gemini formatting
                    combined_text = "\n\n".join([r.get('text', '') for r in results])
                    formatted_answer = self.format_with_gemini(query, combined_text)
                    # Ensure there's a space after periods for better text wrapping
                    formatted_answer = formatted_answer.replace('.', '. ').replace('  ', ' ')
                except Exception as e:
                    logger.error(f"Error formatting with Gemini: {str(e)}")
                    # If Gemini formatting fails, use the original formatted answer
                    pass
            
            # Return the response with newlines intact - let the frontend handle the display
            return formatted_answer, sources, True
            
        except Exception as e:
            logger.error(f"Error in get_answer: {str(e)}", exc_info=True)
            return None, [], False

# Singleton instance
chatbot_service = ChatbotService()
