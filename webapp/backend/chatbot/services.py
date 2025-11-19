import os
import logging
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
import pickle
import re
import torch
import google.generativeai as genai
from django.conf import settings
from sentence_transformers import util

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
            
            # Path to the trained model directory (relative to this file)
            model_dir = Path(__file__).parent.parent.parent.parent / "chatbot/trained_model"
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
        """Format the answer using Gemini for better readability with a structured format."""
        if not self.gemini_model:
            return self.markdown_to_plain_text(raw_answer)
            
        try:
            prompt = f"""Provide a brief and direct answer to this question: {query}

IMPORTANT GUIDELINES:
- Keep your answer under 150 words
- Be direct and to the point
- Do not use markdown formatting, asterisks, brackets, or any special symbols
- Write in plain text sentences
- Do NOT use bullet points or numbered lists
- Focus on the most important information only

Context: {raw_answer[:2000]}

Answer:"""
            
            response = self.gemini_model.generate_content(prompt)
            formatted = response.text.strip()
            
            # Convert markdown to plain text
            return self.markdown_to_plain_text(formatted)
            
        except Exception as e:
            logger.error(f"Error formatting with Gemini: {str(e)}")
            return raw_answer  # Return original if formatting fails
            
    def get_gemini_fallback(self, query: str) -> Tuple[str, List[Dict[str, Any]], bool]:
        """Get a well-structured fallback answer from Gemini for technical topics not in course materials."""
        if not GEMINI_AVAILABLE or not self.gemini_model:
            return "I'm sorry, I couldn't find a relevant answer to your question. Could you please rephrase or ask something else?", [], False
            
        try:
            # Check if the query appears to be a technical topic
            technical_indicators = [
                # Common technical terms
                'what is', 'how does', 'explain', 'difference between',
                # Common technical domains
                'algorithm', 'data structure', 'programming', 'computer science',
                'software', 'hardware', 'network', 'database', 'system design',
                'framework', 'library', 'api', 'devops', 'cloud', 'security'
            ]
            
            is_technical = any(indicator in query.lower() for indicator in technical_indicators)
            
            if is_technical:
                prompt = f"""Provide a brief and direct answer to this question: {query}

IMPORTANT GUIDELINES:
- Keep your answer under 150 words
- Be direct and to the point
- Do not use markdown formatting, asterisks, brackets, or any special symbols
- Write in plain text sentences
- Do NOT use bullet points or numbered lists
- Focus on the most important information only

Answer:"""
            else:
                # For general knowledge questions
                prompt = f"""Provide a brief and direct answer to this question: {query}

IMPORTANT GUIDELINES:
- Keep your answer under 150 words
- Be direct and to the point
- Do not use markdown formatting, asterisks, brackets, or any special symbols
- Write in plain text sentences
- Do NOT use bullet points or numbered lists
- Focus on the most important information only

Answer:"""
            
            response = self.gemini_model.generate_content(prompt)
            answer = self.markdown_to_plain_text(response.text)
            
            # Format the response with proper spacing and structure
            source_type = "Technical Knowledge (Gemini AI)" if is_technical else "General Knowledge (Gemini AI)"
            formatted_answer = f"{answer}\n\nNote: This explanation was generated by Gemini AI based on {source_type}."
            
            return formatted_answer, [{
                'text': answer,
                'score': 1.0,
                'metadata': {
                    'source': source_type,
                    'subject': 'Computer Science',
                    'filename': 'n/a',
                    'is_generated': True
                }
            }], True
        except Exception as e:
            logger.error(f"Error getting Gemini fallback: {str(e)}")
            return "I'm sorry, I couldn't find a relevant answer to your question. Could you please rephrase or ask something else?", [], False
    
    def format_answer(self, results: List[dict], query: str = '') -> Tuple[str, List[Dict[str, Any]]]:
        """Format the answer in a clear, structured way with key points and references.
        
        Args:
            results: List of result dictionaries containing text and metadata
            query: The original user query (used for context in formatting and fallback)
            
        Returns:
            Tuple of (formatted_answer, sources)
        """
        if not results:
            # If no results found, try to get a general knowledge response from Gemini
            if GEMINI_AVAILABLE and self.gemini_model and query:
                try:
                    # Generate a response directly about the query without analyzing course materials
                    prompt = f"""Provide a brief and direct answer to this question: {query}

IMPORTANT GUIDELINES:
- Keep your answer under 150 words
- Be direct and to the point
- Do not use markdown formatting, asterisks, brackets, or any special symbols
- Write in plain text sentences
- Do NOT use bullet points or numbered lists
- Focus on the most important information only

Answer:"""
                    
                    response = self.gemini_model.generate_content(prompt)
                    gemini_response = self.markdown_to_plain_text(response.text.strip())
                    
                    # Format the response to be clear and helpful
                    formatted_response = (
                        f"{gemini_response}\n\n"
                        f"Note: This is a general knowledge response and may not reflect specific course content. "
                        f"For official details, please refer to VTU's resources."
                    )
                    return formatted_response, []
                except Exception as e:
                    logger.error(f"Error getting Gemini fallback in format_answer: {str(e)}")
                    
            return "I couldn't find any relevant information in the course materials about this topic. ", []
            
        # Sort results by score in descending order
        results.sort(key=lambda x: x.get('score', 0), reverse=True)
        
        # Get the best matching result to use for the main answer
        best_result = results[0]
        best_text = best_result.get('text', '').strip()
        
        # If we have Gemini available, use it to summarize and format the response
        if GEMINI_AVAILABLE and self.gemini_model and len(best_text) > 500:
            try:
                prompt = f"""Provide a brief and direct answer to this question: {query}

IMPORTANT GUIDELINES:
- Keep your answer under 150 words
- Be direct and to the point
- Do not use markdown formatting, asterisks, brackets, or any special symbols
- Write in plain text sentences
- Do NOT use bullet points or numbered lists
- Focus on the most important information only

Context: {best_text[:2000]}

Answer:"""
                
                response = self.gemini_model.generate_content(prompt)
                formatted_answer = self.markdown_to_plain_text(response.text.strip())
                
                # Add source information
                sources = [{
                    'text': best_text,
                    'score': best_result.get('score', 0),
                    'metadata': {
                        'subject': best_result.get('subject', 'Unknown'),
                        'filename': best_result.get('filename', 'Unknown File'),
                        'relevance': f"{best_result.get('score', 0):.1%}"
                    }
                }]
                
                # Add references
                formatted_answer += "\n\n📚 References:\n"
                seen_sources = set()
                for result in results[:3]:  # Limit to top 3 sources
                    source_key = f"{result.get('subject', 'Unknown')} - {result.get('filename', 'Unknown')}"
                    if source_key not in seen_sources:
                        seen_sources.add(source_key)
                        formatted_answer += f"• {source_key} (Relevance: {result.get('score', 0):.1%})\n"
                
                formatted_answer += "\nNote: Information is extracted from course materials. For official details, refer to VTU's resources."
                
                return formatted_answer, sources
                
            except Exception as e:
                logger.error(f"Error formatting with Gemini: {str(e)}")
                # Fall through to default formatting if Gemini fails
        
        # Default formatting if Gemini is not available or fails
        formatted_answer = []
        sources = []
        seen_sources = set()
        
        # Add the best matching result as the main answer
        if best_text:
            # Take first 3 paragraphs or first 500 chars, whichever is shorter
            paragraphs = [p.strip() for p in best_text.split('\n\n') if p.strip()]
            formatted_answer.append("\n".join(paragraphs[:3])[:500])
            
            sources.append({
                'text': best_text,
                'score': best_result.get('score', 0),
                'metadata': {
                    'subject': best_result.get('subject', 'Unknown'),
                    'filename': best_result.get('filename', 'Unknown File'),
                    'relevance': f"{best_result.get('score', 0):.1%}"
                }
            })
        
        # Add references to other relevant sources
        if len(results) > 1:
            formatted_answer.append("\n📚 Additional References:")
            for result in results[1:4]:  # Limit to top 3 additional sources
                source_key = f"{result.get('subject', 'Unknown')} - {result.get('filename', 'Unknown')}"
                if source_key not in seen_sources:
                    seen_sources.add(source_key)
                    formatted_answer.append(f"• {source_key} (Relevance: {result.get('score', 0):.1%})")
        
        formatted_answer.append("\nNote: Information is extracted from course materials. For official details, refer to VTU's resources.")
        
        return "\n\n".join([p for p in formatted_answer if p]), sources
    
    def markdown_to_plain_text(self, text: str) -> str:
        """Convert markdown formatted text to plain text with proper formatting.
        
        Args:
            text: Input text with markdown formatting
            
        Returns:
            Plain text with all markdown symbols removed and clean formatting
        """
        if not text:
            return ""
            
        try:
            # Remove all asterisks (bold, italic, bullet points)
            text = text.replace('*', '')
            
            # Remove underscores
            text = text.replace('_', '')
            
            # Remove backticks for code
            text = text.replace('`', '')
            
            # Remove markdown brackets
            text = text.replace('[', '').replace(']', '')
            
            # Remove bullet points and list markers more aggressively
            # Remove lines starting with * or - or + followed by space
            text = re.sub(r'^[\s]*[\*\-\+]\s+', '', text, flags=re.MULTILINE)
            # Remove numbered list markers (e.g., "1.", "2.", etc.)
            text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
            # Remove any remaining bullet points in the middle of text
            text = re.sub(r'\s*[\*\-\+]\s*', ' ', text)
            
            # Remove any remaining markdown-like patterns
            # Remove "**word**" patterns (bold)
            text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
            # Remove "*word*" patterns (italic)
            text = re.sub(r'\*(.*?)\*', r'\1', text)
            
            # Remove markdown links [text](url) -> text
            text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
            # Remove markdown headers
            text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
            # Remove code blocks
            text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)
            # Remove blockquotes
            text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
            # Remove horizontal rules
            text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
            # Remove any remaining markdown link references
            text = re.sub(r'\[.*?\]\s*\[.*?\]', '', text)
            # Remove any remaining HTML tags
            text = re.sub(r'<[^>]+>', '', text)
            
            # Clean up extra spaces and newlines
            text = re.sub(r'\s+', ' ', text)
            text = text.strip()
            
            return text
            
        except Exception as e:
            logger.error(f"Error in markdown_to_plain_text: {str(e)}")
            # Return original text with markdown symbols removed as fallback
            return re.sub(r'[#*_`\[\]()]', '', text)

    def get_welcome_response(self) -> str:
        """Generate a welcoming response for greetings and common questions."""
        welcome_text = """Hello there! I'm your dedicated VTU (Visvesvaraya Technological University) assistant, and I'm here to help you navigate through various aspects of your academic journey at VTU.

Here's a detailed explanation of what I can do and how I can assist you:

1. What I Can Do:
I'm ready to assist you with any queries you might have regarding Visvesvaraya Technological University subjects. My purpose is to serve as a reliable source of information, offering clarity and comprehensive guidance on a wide range of subject topics.

2. How to Use Me
You can ask me questions related to your subjects, and I will use the textbooks that I was trained on to provide the best possible response. 

Feel free to ask me anything about your subjects, and I'll do my best to help!"""
        return self.markdown_to_plain_text(welcome_text)

    def is_general_knowledge_question(self, query: str) -> bool:
        """
        Check if the query is a general knowledge question that's unlikely to be in course materials.
        This is designed to be very conservative to avoid false positives.
        """
        query_lower = query.lower().strip()
        
        # List of very specific general knowledge patterns that are definitely not in course materials
        general_indicators = [
            # Basic math
            '1+1', '2+2', '3+3', '4+4', '5+5', '6+6', '7+7', '8+8', '9+9', '10+10',
            '1 + 1', '2 + 2', '3 + 3', '4 + 4', '5 + 5',
            # Very basic facts
            'capital of', 'president of', 'prime minister of', 'population of',
            # Current events (which wouldn't be in course materials)
            'current', 'today', 'now', 'recent',
            # Trivia
            'how much', 'how old',
        ]
        
        # Check for math expressions
        import re
        if re.search(r'^\s*\d+\s*[+\-*/]\s*\d+\s*$', query):
            return True
            
        # Check against general indicators
        if any(indicator in query_lower for indicator in general_indicators):
            return True
            
        # Check for very short questions that are likely too basic
        if len(query.split()) <= 3 and query_lower.startswith(('who is', 'when was', 'where is')):
            # But exclude questions that might be about technical terms
            tech_terms = ['django', 'python', 'java', 'c++', 'javascript', 'html', 'css', 'sql',
                        'database', 'algorithm', 'function', 'class', 'object', 'variable',
                        'loop', 'array', 'list', 'dictionary', 'api', 'framework']
            if not any(term in query_lower for term in tech_terms):
                return True
                
        return False

    def get_answer(self, query: str, top_k: int = 10, threshold: float = 0.3) -> Tuple[Optional[str], List[dict], bool]:
        """
        Get answer from the trained model with formatted output
        
        Args:
            query: User's question
            top_k: Increased to 10 to get more potential matches
            threshold: Lowered to 0.3 to be more inclusive of potential matches
            
        Returns:
            Tuple of (formatted_answer, sources, found)
        """
        logger.info(f"Getting answer for query: {query}")
        
        # Check for greetings and common questions
        greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']
        common_questions = {
            'who are you': 'introduction',
            'what can you do': 'introduction',
            'help': 'introduction',
            'how can you help': 'introduction'
        }
        
        query_lower = query.lower().strip('?,.! ')
        
        # Handle greetings
        if any(greeting in query_lower for greeting in greetings):
            logger.info("Greeting detected, returning welcome message")
            return self.get_welcome_response(), [], True
            
        # Handle common questions
        if query_lower in common_questions:
            logger.info(f"Common question detected: {query_lower}")
            return self.get_welcome_response(), [], True
        
        # First, check if this is a general knowledge question
        if GEMINI_AVAILABLE and self.is_general_knowledge_question(query):
            logger.info("General knowledge question detected, using Gemini fallback")
            return self.get_gemini_fallback(query)
        
        if not self.available or not self.model or not self.index or not self.data:
            logger.error("Chatbot service not properly initialized")
            if GEMINI_AVAILABLE:
                logger.info("Service not available, trying Gemini fallback")
                return self.get_gemini_fallback(query)
            return None, [], False
            
        try:
            # First, check if the query is likely technical using semantic similarity
            # with common technical concepts in the embedding space
            technical_indicators = [
                'programming', 'algorithm', 'database', 'system design', 'data structure',
                'computer science', 'software engineering', 'distributed systems', 'big data',
                'machine learning', 'artificial intelligence', 'cloud computing', 'networking',
                'operating systems', 'computer architecture', 'cybersecurity', 'web development',
                'mobile development', 'devops', 'data science', 'data analysis', 'computer vision',
                'natural language processing', 'blockchain', 'internet of things', 'quantum computing',
                'django', 'nosql', 'internet of things', 'IoT', 'deep learning', 'cryptography', 
                'database', 'software engineering', 'python', 'java', 'c++', 'javascript', 'html', 'css', 'sql'
            ]
            
            # Encode the query and technical indicators
            query_embedding = self.model.encode([query], convert_to_tensor=True)
            tech_embeddings = self.model.encode(technical_indicators, convert_to_tensor=True)
            
            # Calculate cosine similarity between query and technical indicators
            cos_sims = util.cos_sim(query_embedding, tech_embeddings)[0]
            
            # Consider it technical if similarity to any technical concept is above threshold
            tech_similarity = float(torch.max(cos_sims))
            is_technical = tech_similarity > 0.3  # Adjust this threshold as needed
            
            # Use a dynamic threshold based on the technical similarity
            # The more technical the query, the lower the threshold
            min_tech_threshold = max(0.05, 0.3 - (tech_similarity * 0.2))  # Range: 0.05 to 0.3
            min_general_threshold = 0.4
            
            logger.info(f"Technical similarity score: {tech_similarity:.4f}, Using threshold: {min_tech_threshold:.4f}")
            
            # Convert to numpy array for FAISS
            query_embedding = query_embedding.cpu().numpy()
            
            # Encode the query
            query_embedding = self.model.encode([query], convert_to_tensor=True)
            query_embedding = query_embedding.cpu().numpy()  # Convert to numpy array for FAISS
            
            # Search the index with more candidates
            D, I = self.index.search(query_embedding, top_k)
            
            # Log the raw distances and indices for debugging
            logger.info(f"Raw distances: {D}")
            logger.info(f"Indices: {I}")
            
            # Get all results with their scores
            results = []
            for dist, idx in zip(D[0], I[0]):
                similarity = float(1.0 - dist)
                try:
                    result = dict(self.data[idx])
                    result['score'] = similarity
                    result['distance'] = float(dist)
                    results.append(result)
                    logger.info(f"Found result with similarity {similarity:.4f}, distance {dist:.4f}: {result.get('text', '')[:100]}...")
                except Exception as e:
                    logger.error(f"Error processing result at index {idx}: {str(e)}")
            
            logger.info(f"Found {len(results)} total results before filtering")
            
            if not results:
                if GEMINI_AVAILABLE:
                    logger.info("No results found, trying Gemini fallback")
                    return self.get_gemini_fallback(query)
                return None, [], False
            
            # Sort results by score in descending order
            results.sort(key=lambda x: x['score'], reverse=True)
            
            # Use different thresholds based on whether this is a technical question
            current_threshold = min_tech_threshold if is_technical else min_general_threshold
            filtered_results = [r for r in results if r['score'] >= current_threshold]
            
            logger.info(f"Found {len(filtered_results)} results after filtering with threshold {current_threshold}")
            
            # If no results above threshold but we have technical terms, take the best matches
            if not filtered_results and is_technical and results:
                # Sort by score in descending order
                results_sorted = sorted(results, key=lambda x: x['score'], reverse=True)
                # Take top 3 results if they have a reasonable score
                filtered_results = [r for r in results_sorted[:3] if r['score'] >= 0.1]
                
                if filtered_results:
                    best_score = filtered_results[0]['score']
                    logger.info(f"Using {len(filtered_results)} technical matches with best score {best_score:.4f}")
                else:
                    # If no results meet even the minimum threshold, take the best one
                    best_match = results_sorted[0]
                    filtered_results = [best_match]
                    logger.info(f"Using best available technical match with score {best_match['score']:.4f}")
            
            if not filtered_results:
                if GEMINI_AVAILABLE:
                    logger.info("No good matches found, trying Gemini fallback")
                    return self.get_gemini_fallback(query)
                return "I couldn't find any relevant information in the course materials about this topic. Please try rephraring your question or ask about a different topic.", [], False
                
            # Format the answer with sources
            formatted_answer, sources = self.format_answer(filtered_results, query)
            
            # For technical questions, always prefer course materials if we have any matches
            # Only fall back to Gemini if we have no results at all
            if not is_technical:
                # For non-technical questions, use a confidence threshold
                best_score = filtered_results[0]['score']
                if best_score < 0.45 and GEMINI_AVAILABLE:  # Increased threshold for general questions
                    logger.info(f"Low confidence results for general question (score: {best_score:.4f}), trying Gemini fallback")
                    return self.get_gemini_fallback(query)
            else:
                # For technical questions, log the confidence but don't fall back to Gemini
                best_score = filtered_results[0]['score']
                logger.info(f"Using technical content with confidence: {best_score:.4f}")
            
            # If Gemini is available, use it to format the answer for better readability
            if GEMINI_AVAILABLE and results and results[0]['score'] > 0.7:
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
            
            return formatted_answer, sources, True
            
        except Exception as e:
            logger.error(f"Error in get_answer: {str(e)}", exc_info=True)
            return None, [], False

# Singleton instance
chatbot_service = ChatbotService()
