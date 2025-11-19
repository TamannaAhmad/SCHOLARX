"""
VTU Assistant - Main Application
Two separate chatbots: Trained Data & Gemini AI
Multi-page: Course Questions + VTU Queries
"""

import streamlit as st
import google.generativeai as genai
from pathlib import Path
import os
import logging
import requests
from bs4 import BeautifulSoup
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Gemini API Key from environment variables
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set. Please add it to your .env file.")

# VTU Websites for queries
VTU_WEBSITES = [
    "https://vtu.ac.in",
    "https://www.vtu.ac.in/en/academics/",
    "https://www.vtu.ac.in/en/examination/",
    "https://www.vtu.ac.in/en/results/",
    "https://www.vtu.ac.in/en/notifications/",
    "https://www.vtu.ac.in/en/circulars/",
    "https://www.vtu.ac.in/en/academic-calendar/",
    "https://www.vtu.ac.in/en/syllabus/",
]

# Page configuration
st.set_page_config(
    page_title="VTU Assistant",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
.stButton > button {
    width: 100%;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.3s ease;
}
.stButton > button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.answer-box {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 10px;
    border-left: 5px solid #11998e;
    margin: 1rem 0;
}
.source-badge {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    margin: 1rem 0;
}
.trained-source {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.gemini-source {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}
</style>
""", unsafe_allow_html=True)


class VTUWebScraper:
    """Web scraper for VTU websites"""
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    
    def scrape_website(self, url: str, query: str) -> Dict:
        """Scrape a single website"""
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Get text
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            # Limit text length
            text = text[:3000]
            
            return {
                'url': url,
                'content': text,
                'success': True
            }
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            return {
                'url': url,
                'content': '',
                'success': False,
                'error': str(e)
            }
    
    def search_all_websites(self, query: str) -> List[Dict]:
        """Search all VTU websites"""
        results = []
        for url in VTU_WEBSITES:
            result = self.scrape_website(url, query)
            results.append(result)
        return results


class TrainedDataChatbot:
    """Chatbot that uses locally trained data"""
    
    def __init__(self):
        self.chatbot = None
        self.available = False
        self.load_model()
    
    def load_model(self):
        """Load the trained model if available"""
        try:
            model_path = Path("trained_model")
            logger.info(f"Checking for trained model at: {model_path.absolute()}")
            
            if model_path.exists():
                logger.info("✅ trained_model folder found")
                from chatbot_trainer import TrainedChatbot
                logger.info("Imported TrainedChatbot successfully")
                
                # TrainedChatbot loads the model automatically in __init__
                self.chatbot = TrainedChatbot(model_dir="trained_model")
                logger.info("✅ TrainedChatbot created and model loaded")
                
                self.available = True
                logger.info("✅ Trained model is now available")
            else:
                logger.warning(f"⚠️ Trained model not found at {model_path.absolute()}")
                self.available = False
        except Exception as e:
            logger.error(f"❌ Error loading trained model: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self.available = False
    
    def get_answer(self, query: str, top_k: int = 3, threshold: float = 0.3):
        """Get answer from trained data"""
        if not self.available or not self.chatbot:
            return None, [], False
        
        try:
            # get_answer returns (answer, sources)
            answer, sources = self.chatbot.get_answer(query, top_k, threshold)
            
            # Check if answer was found
            found = answer is not None and len(sources) > 0
            return answer, sources, found
        except Exception as e:
            logger.error(f"Error getting answer: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None, [], False


class GeminiChatbot:
    """Chatbot that uses Gemini AI for general questions"""
    
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        # Using gemini-2.5-flash
        try:
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            logger.info("Using Gemini 2.5 Flash model")
        except Exception as e:
            logger.error(f"Error initializing model: {e}")
            self.model = None
    
    def get_answer(self, query: str) -> str:
        """Get answer from Gemini AI"""
        if not self.model:
            return "❌ Gemini AI model not available. Please check your API key."
        
        try:
            prompt = f"""You are a helpful assistant for VTU (Visvesvaraya Technological University) students and faculty.

Provide a comprehensive answer to this question: {query}

IMPORTANT: 
- Provide your answer in plain text format only
- DO NOT use markdown formatting like **bold**, *italic*, or bullet points
- DO NOT use asterisks, brackets, or special symbols
- Write in clear, readable sentences and paragraphs
- Do NOT use bullet points (with * or -) or numbered lists. Instead, write in paragraph form or use simple commas to separate items

{context if context else ""}

Answer:"""
            
            response = self.model.generate_content(prompt)
            return clean_text(response.text)
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error generating response: {error_msg}")
            
            # Provide helpful error messages
            if "500" in error_msg:
                return """❌ **Gemini API Error (500 Internal Server Error)**

This could be due to:
1. **API Quota Exceeded** - You may have hit the free tier limit
2. **Temporary Service Issue** - Google's servers might be experiencing problems
3. **Invalid API Key** - The API key might be expired or invalid

**Solutions:**
- Wait a few minutes and try again
- Check your API quota at: https://aistudio.google.com/app/apikey
- Generate a new API key if needed
- Try using the trained data instead (it works offline!)"""
            
            elif "quota" in error_msg.lower():
                return "❌ **API Quota Exceeded**\n\nYou've reached the free tier limit. Please wait or upgrade your API plan.\n\n💡 **Tip:** Use the trained textbook data instead - it works without API calls!"
            
            elif "api key" in error_msg.lower():
                return "❌ **Invalid API Key**\n\nPlease check your Gemini API key and update it in the code."
            
            else:
                return f"❌ Error: {error_msg}\n\n💡 Try using trained textbook data instead!"


def clean_text(text: str) -> str:
    """Remove markdown symbols and clean up text"""
    if not text:
        return text
    
    import re
    
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
    
    # Clean up extra spaces and newlines
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    
    return text


def initialize_chatbots():
    """Initialize both chatbots"""
    if 'trained_chatbot' not in st.session_state:
        st.session_state.trained_chatbot = TrainedDataChatbot()
    
    if 'gemini_chatbot' not in st.session_state:
        st.session_state.gemini_chatbot = GeminiChatbot(GEMINI_API_KEY)
    
    if 'chat_history' not in st.session_state:
        st.session_state.chat_history = []


def display_answer(answer: str, source: str, sources_list: list = None):
    """Display answer with source badge"""
    
    # Clean the answer text
    answer = clean_text(answer)
    
    # Source badge
    if source == "trained":
        st.markdown("""
        <div class="source-badge trained-source">
            📚 Answer from Trained Textbooks
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="source-badge gemini-source">
            🤖 Answer from Gemini AI
        </div>
        """, unsafe_allow_html=True)
    
    # Answer - Use text_area to avoid markup issues
    st.text_area("Answer:", value=answer, height=200, disabled=True, key=f"answer_{hash(answer)}")
    
    # Show sources if from trained data
    if source == "trained" and sources_list:
        with st.expander("📖 View Source Textbooks", expanded=True):
            st.markdown("**References from your course materials:**")
            for i, src in enumerate(sources_list, 1):
                relevance_color = "#28a745" if src['score'] > 0.7 else "#ffc107" if src['score'] > 0.5 else "#dc3545"
                st.markdown(f"""
                <div style="background: white; padding: 0.8rem; border-radius: 5px; margin: 0.5rem 0; border-left: 3px solid {relevance_color};">
                    <strong>{i}. {src['subject']}</strong><br>
                    📄 {src['filename']}<br>
                    <span style="color: {relevance_color};">⭐ Relevance: {src['score']:.1%}</span>
                </div>
                """, unsafe_allow_html=True)


def render_vtu_queries_page():
    """Render VTU Queries page"""
    # Header
    st.markdown("""
    <div style="background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%); padding: 2rem; border-radius: 10px; color: white; text-align: center; margin-bottom: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h1>🏛️ VTU Administrative Queries</h1>
        <p style="font-size: 1.1em; margin-bottom: 0.5rem;">Get answers about VTU exams, results, notifications, and procedures</p>
        <p style="font-size: 0.9em; opacity: 0.9;">Powered by web scraping + Gemini 2.5 Flash AI</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Info banner
    st.info("💡 **How it works:** We search 8 official VTU websites and use AI to provide comprehensive answers based on the latest information.")
    
    # Initialize web scraper and chatbot
    if 'vtu_scraper' not in st.session_state:
        st.session_state.vtu_scraper = VTUWebScraper()
    
    if 'vtu_gemini' not in st.session_state:
        st.session_state.vtu_gemini = GeminiChatbot(GEMINI_API_KEY)
    
    if 'vtu_history' not in st.session_state:
        st.session_state.vtu_history = []
    
    # Sidebar
    with st.sidebar:
        st.header("🌐 VTU Data Sources")
        st.caption("Official VTU websites we search:")
        
        with st.expander("📋 View All Websites", expanded=False):
            for i, website in enumerate(VTU_WEBSITES, 1):
                domain = website.split('/')[2]
                path = '/'.join(website.split('/')[3:]) if len(website.split('/')) > 3 else 'Home'
                st.markdown(f"**{i}.** `{domain}`")
                if path != 'Home':
                    st.caption(f"   └─ {path}")
        
        st.markdown("---")
        
        # Statistics
        st.subheader("📊 Query Stats")
        total_queries = len(st.session_state.vtu_history)
        st.metric("Total Queries", total_queries)
        
        if total_queries > 0:
            avg_success = sum(q['successful_searches'] for q in st.session_state.vtu_history) / total_queries
            st.metric("Avg Success Rate", f"{(avg_success/len(VTU_WEBSITES)*100):.1f}%")
        
        st.markdown("---")
        
        if st.button("🗑️ Clear History", use_container_width=True):
            st.session_state.vtu_history = []
            st.rerun()
    
    # Main content
    st.header("💬 Ask VTU Questions")
    
    # Quick questions organized by category
    st.markdown("### 🚀 Popular VTU Queries")
    
    # Exams & Results
    st.markdown("#### 📝 Exams & Results")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if st.button("📅 Exam Dates 2024", use_container_width=True, key="exam_dates"):
            st.session_state.vtu_quick = "What are the upcoming VTU exam dates for 2024?"
            st.rerun()
    
    with col2:
        if st.button("📊 Check Results", use_container_width=True, key="check_results"):
            st.session_state.vtu_quick = "How to check VTU exam results online step by step?"
            st.rerun()
    
    with col3:
        if st.button("📈 Result Analysis", use_container_width=True, key="result_analysis"):
            st.session_state.vtu_quick = "How to view VTU result analysis and statistics?"
            st.rerun()
    
    # Revaluation & Certificates
    st.markdown("#### 📜 Revaluation & Documents")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if st.button("🔄 Revaluation Process", use_container_width=True, key="revaluation"):
            st.session_state.vtu_quick = "How to apply for VTU revaluation and what is the process?"
            st.rerun()
    
    with col2:
        if st.button("📜 Download Transcripts", use_container_width=True, key="transcripts"):
            st.session_state.vtu_quick = "How to download VTU transcripts and mark sheets online?"
            st.rerun()
    
    with col3:
        if st.button("🎓 Degree Certificate", use_container_width=True, key="degree_cert"):
            st.session_state.vtu_quick = "How to get VTU degree certificate and what documents are needed?"
            st.rerun()
    
    # Notifications & Academic
    st.markdown("#### 🔔 Notifications & Academic")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if st.button("🔔 Latest Notifications", use_container_width=True, key="notifications"):
            st.session_state.vtu_quick = "What are the latest VTU notifications and circulars?"
            st.rerun()
    
    with col2:
        if st.button("📚 Syllabus & Scheme", use_container_width=True, key="syllabus"):
            st.session_state.vtu_quick = "Where can I find VTU syllabus and scheme for my branch?"
            st.rerun()
    
    with col3:
        if st.button("📅 Academic Calendar", use_container_width=True, key="calendar"):
            st.session_state.vtu_quick = "What is the VTU academic calendar for current year?"
            st.rerun()
    
    st.markdown("---")
    
    # Question input
    user_query = st.text_area(
        "Type your VTU question here:",
        placeholder="e.g., VTU exam dates 2024, How to apply for revaluation, Latest VTU notifications",
        height=100,
        key="vtu_query",
        help="Ask anything about VTU administration, exams, results, etc."
    )
    
    # Handle quick question
    if 'vtu_quick' in st.session_state:
        user_query = st.session_state.vtu_quick
        del st.session_state.vtu_quick
    
    # Submit button
    col1, col2 = st.columns([4, 1])
    with col1:
        submit_button = st.button("🔍 Search VTU", use_container_width=True, type="primary")
    with col2:
        if st.button("🔄 New", use_container_width=True):
            st.rerun()
    
    # Process query
    if submit_button and user_query.strip():
        query = user_query.strip()
        
        with st.spinner("🌐 Searching VTU websites..."):
            # Search VTU websites
            search_results = st.session_state.vtu_scraper.search_all_websites(query)
            
            # Collect successful results
            relevant_content = []
            successful_searches = 0
            
            for result in search_results:
                if result['success'] and result['content']:
                    relevant_content.append(f"From {result['url']}:\n{result['content']}")
                    successful_searches += 1
            
            # Combine context
            context = '\n\n'.join(relevant_content)
            
            # Generate answer with Gemini
            st.info("🤖 Generating comprehensive answer...")
            
            # Create a custom Gemini call with context
            try:
                prompt = f"""You are a helpful VTU (Visvesvaraya Technological University) assistant.
Based on the information gathered from VTU websites, answer the following question clearly and comprehensively.

IMPORTANT: Provide your answer in plain text format. DO NOT use markdown formatting, asterisks, brackets, or any special symbols. Just write clear, readable sentences. Do NOT use bullet points (with * or -) or numbered lists. Instead, write in paragraph form or use simple commas to separate items.

Question: {query}

Context from VTU websites:
{context if context else "No specific information found on VTU websites."}

Provide a detailed, helpful answer in plain text. If the context doesn't contain specific information, provide general guidance about VTU procedures.

Answer:"""
                
                response = st.session_state.vtu_gemini.model.generate_content(prompt)
                answer = clean_text(response.text)
            except Exception as e:
                answer = f"Error generating answer: {str(e)}"
            
            # Save to history
            st.session_state.vtu_history.append({
                'query': query,
                'answer': answer,
                'successful_searches': successful_searches
            })
        
        # Display answer
        st.markdown("---")
        st.markdown("### 💡 Your Answer")
        
        st.markdown("""
        <div class="source-badge" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            🌐 Answer from VTU Official Websites + Gemini 2.5 Flash AI
        </div>
        """, unsafe_allow_html=True)
        
        # Use text_area to avoid markup issues
        cleaned_answer = clean_text(answer)
        st.text_area("Answer:", value=cleaned_answer, height=200, disabled=True, key=f"vtu_answer_{hash(answer)}")
        
        # Show which websites had content
        if successful_searches > 0:
            with st.expander("🌐 View Data Sources", expanded=False):
                st.markdown("**Websites that provided information:**")
                for result in search_results:
                    if result['success'] and result['content']:
                        st.markdown(f"✅ {result['url']}")
        
        # Statistics
        st.markdown("---")
        st.markdown("#### 📊 Search Statistics")
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("🌐 Websites Searched", len(VTU_WEBSITES))
        with col2:
            st.metric("✅ Content Found", successful_searches)
        with col3:
            success_rate = (successful_searches / len(VTU_WEBSITES) * 100) if len(VTU_WEBSITES) > 0 else 0
            st.metric("📊 Success Rate", f"{success_rate:.1f}%")
        with col4:
            st.metric("🤖 AI Model", "Gemini 2.5")
        
        # Helpful tips
        if success_rate < 50:
            st.warning("⚠️ **Low success rate detected.** The information might be limited. Consider visiting VTU website directly for the most accurate details.")
        else:
            st.success("✅ **Good data coverage!** The answer is based on multiple official VTU sources.")
    
    # VTU History
    if st.session_state.vtu_history:
        st.markdown("---")
        st.header("📝 Recent VTU Queries")
        st.caption(f"Showing last {min(5, len(st.session_state.vtu_history))} queries")
        
        for i, chat in enumerate(reversed(st.session_state.vtu_history[-5:])):
            with st.expander(f"🌐 {chat['query'][:60]}...", expanded=False):
                st.markdown(f"**Q:** {chat['query']}")
                st.markdown("**A:**")
                answer_preview = chat['answer'][:300] + "..." if len(chat['answer']) > 300 else chat['answer']
                st.info(answer_preview)
                st.success(f"✅ Found content from {chat['successful_searches']} websites")
    
    # Footer with helpful links
    st.markdown("---")
    st.markdown("### 🔗 Helpful VTU Links")
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.markdown("""
        **📚 Academic**
        - [VTU Main Website](https://vtu.ac.in)
        - [Syllabus](https://www.vtu.ac.in/en/syllabus/)
        - [Academic Calendar](https://www.vtu.ac.in/en/academic-calendar/)
        """)
    
    with col2:
        st.markdown("""
        **📝 Exams & Results**
        - [Examination](https://www.vtu.ac.in/en/examination/)
        - [Results](https://www.vtu.ac.in/en/results/)
        - [Revaluation](https://www.vtu.ac.in/en/examination/)
        """)
    
    with col3:
        st.markdown("""
        **🔔 Updates**
        - [Notifications](https://www.vtu.ac.in/en/notifications/)
        - [Circulars](https://www.vtu.ac.in/en/circulars/)
        - [News & Events](https://vtu.ac.in)
        """)
    
    st.markdown("---")
    st.markdown("""
    <div style="text-align: center; color: #666; padding: 1rem;">
        <p>🏛️ <strong>VTU Administrative Queries</strong> | Web Scraping + AI System</p>
        <p>🌐 Searches 8 official VTU websites | 🤖 Powered by Gemini 2.5 Flash</p>
        <p style="font-size: 0.9em;">For official information, always verify with VTU website directly</p>
    </div>
    """, unsafe_allow_html=True)


def render_course_questions_page():
    """Render Course Questions page (original main content)"""
    # Header
    st.markdown("""
    <div style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); padding: 2rem; border-radius: 10px; color: white; text-align: center; margin-bottom: 2rem;">
        <h1>🎓 VTU Assistant</h1>
        <p>Dual Chatbot System: Trained Data + Gemini AI</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Initialize chatbots
    initialize_chatbots()
    
    # Sidebar
    with st.sidebar:
        st.header("🤖 Chatbot Status")
        
        # Trained Data Status
        if st.session_state.trained_chatbot.available:
            st.success("✅ Trained Data: Available")
            
            # Show trained subjects
            with st.expander("📚 Trained Subjects", expanded=False):
                subjects = [
                    "Big Data Analytics",
                    "Cloud Computing",
                    "Deep Learning",
                    "Django Framework",
                    "Java Programming",
                    "Cryptography & Network Security",
                    "NoSQL Databases",
                    "Internet of Things",
                    "Software Engineering"
                ]
                for subject in subjects:
                    st.write(f"• {subject}")
        else:
            st.warning("⚠️ Trained Data: Not Available")
            st.info("Run `python train_chatbot.py` to train the model")
        
        st.success("✅ Gemini AI: Active")
        
        st.markdown("---")
        
        st.header("ℹ️ How It Works")
        st.markdown("""
        **Step 1:** Type your question
        
        **Step 2:** System checks trained data first
        
        **Step 3:** If found → Shows answer from textbooks
        
        **Step 4:** If not found → Uses Gemini AI
        
        **Result:** You always get an answer! ✨
        """)
        
        st.markdown("---")
        
        if st.button("🗑️ Clear History", use_container_width=True):
            st.session_state.chat_history = []
            st.rerun()
    
    # Main content
    st.header("💬 Ask Your Question")
    
    # Quick questions for trained data
    if st.session_state.trained_chatbot.available:
        st.markdown("### 🚀 Quick Questions (From Trained Data)")
        
        col1, col2, col3 = st.columns(3)
        
        with col1:
            if st.button("💡 What is Big Data?", use_container_width=True):
                st.session_state.quick_question = "What is Big Data and its characteristics?"
                st.rerun()
            if st.button("💡 Explain Hadoop", use_container_width=True):
                st.session_state.quick_question = "Explain Hadoop architecture and components"
                st.rerun()
        
        with col2:
            if st.button("💡 What is Cloud Computing?", use_container_width=True):
                st.session_state.quick_question = "What is cloud computing and its service models?"
                st.rerun()
            if st.button("💡 Deep Learning Basics", use_container_width=True):
                st.session_state.quick_question = "What is deep learning and neural networks?"
                st.rerun()
        
        with col3:
            if st.button("💡 Django Framework", use_container_width=True):
                st.session_state.quick_question = "What is Django framework and its architecture?"
                st.rerun()
            if st.button("💡 Java OOP Concepts", use_container_width=True):
                st.session_state.quick_question = "Explain Object Oriented Programming concepts in Java"
                st.rerun()
        
        st.markdown("---")
    
    # Question input
    user_query = st.text_area(
        "Type your question here:",
        placeholder="e.g., What is Big Data? Explain cloud computing. VTU exam dates?",
        height=100,
        key="user_query",
        help="Ask anything - system will check trained data first, then use Gemini AI"
    )
    
    # Handle quick question
    if 'quick_question' in st.session_state:
        user_query = st.session_state.quick_question
        del st.session_state.quick_question
    
    # Submit button
    col1, col2 = st.columns([4, 1])
    with col1:
        submit_button = st.button("🔍 Get Answer", use_container_width=True, type="primary")
    with col2:
        if st.button("🔄 New", use_container_width=True):
            st.rerun()
    
    # Process query
    if submit_button and user_query.strip():
        query = user_query.strip()
        
        with st.spinner("🔍 Searching for answer..."):
            # Step 1: Try trained data first
            answer_text = None
            source_type = None
            sources_list = None
            
            if st.session_state.trained_chatbot.available:
                st.info("📚 Checking trained textbooks...")
                trained_answer, sources, found = st.session_state.trained_chatbot.get_answer(query)
                
                if found and trained_answer:
                    # Clean the raw trained answer first
                    trained_answer = clean_text(trained_answer)
                    
                    # Format with Gemini for better presentation
                    try:
                        format_prompt = f"""Format this answer in a clear, educational way using plain text only:

Question: {query}

Raw Answer from Textbook:
{trained_answer}

IMPORTANT: Provide your answer in plain text format. DO NOT use markdown formatting, asterisks, brackets, or any special symbols. Just write clear, readable sentences. Do NOT use bullet points (with * or -) or numbered lists. Instead, write in paragraph form or use simple commas to separate items."""
                        
                        response = st.session_state.gemini_chatbot.model.generate_content(format_prompt)
                        answer_text = clean_text(response.text)
                    except:
                        answer_text = trained_answer
                    
                    source_type = "trained"
                    sources_list = sources
                    st.success("✅ Found in trained textbooks!")
                else:
                    st.warning("⚠️ Not found in trained data. Using Gemini AI...")
            
            # Step 2: If not found in trained data, use Gemini
            if answer_text is None:
                st.info("🤖 Generating answer with Gemini AI...")
                answer_text = st.session_state.gemini_chatbot.get_answer(query)
                source_type = "gemini"
            
            # Save to history
            st.session_state.chat_history.append({
                'query': query,
                'answer': answer_text,
                'source': source_type,
                'sources': sources_list
            })
        
        # Display answer
        st.markdown("---")
        st.markdown("### 💡 Answer")
        
        # Clean the answer text before displaying
        cleaned_answer_text = clean_text(answer_text)
        display_answer(cleaned_answer_text, source_type, sources_list)
        
        # Statistics
        st.markdown("---")
        if source_type == "trained":
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("📚 Source", "Trained Data")
            with col2:
                st.metric("📖 Textbooks", len(sources_list) if sources_list else 0)
            with col3:
                if sources_list:
                    avg_score = sum(s['score'] for s in sources_list) / len(sources_list)
                    st.metric("🎯 Relevance", f"{avg_score:.1%}")
        else:
            col1, col2 = st.columns(2)
            with col1:
                st.metric("🤖 Source", "Gemini AI")
            with col2:
                st.metric("⚡ Model", "Gemini 2.5 Flash")
    
    # Chat history
    if st.session_state.chat_history:
        st.markdown("---")
        st.header("📝 Recent Questions")
        st.caption(f"Showing last {min(5, len(st.session_state.chat_history))} questions")
        
        for i, chat in enumerate(reversed(st.session_state.chat_history[-5:])):
            source_icon = "📚" if chat['source'] == "trained" else "🤖"
            with st.expander(f"{source_icon} {chat['query'][:60]}...", expanded=False):
                st.markdown(f"**Q:** {chat['query']}")
                st.markdown("**A:**")
                
                # Truncate long answers in history
                answer_preview = chat['answer'][:300] + "..." if len(chat['answer']) > 300 else chat['answer']
                st.info(answer_preview)
                
                if chat['source'] == "trained":
                    st.success("✅ From trained textbooks")
                else:
                    st.info("🤖 From Gemini AI")
    
    # Footer
    st.markdown("---")
    model_status = "✅ Trained on 17+ textbooks" if st.session_state.trained_chatbot.available else "⚠️ Model not trained"
    
    st.markdown(f"""
    <div style="text-align: center; color: #666; padding: 1rem;">
        <p>🎓 <strong>VTU Assistant</strong> | Dual Chatbot System</p>
        <p>📚 {model_status} | 🤖 Powered by Gemini 2.5 Flash</p>
        <p style="font-size: 0.9em;">Smart system: Checks trained data first, uses Gemini AI as fallback</p>
    </div>
    """, unsafe_allow_html=True)


def main():
    """Main application with page navigation"""
    # Sidebar navigation
    st.sidebar.title("🎓 VTU Assistant")
    st.sidebar.markdown("---")
    
    page = st.sidebar.radio(
        "Choose a section:",
        ["📚 Course Questions", "🏛️ VTU Queries"],
        index=0
    )
    
    st.sidebar.markdown("---")
    st.sidebar.info("**📚 Course Questions:** Ask about subjects from your textbooks\n\n**🏛️ VTU Queries:** Ask about VTU exams, results, administration")
    
    # Render selected page
    if page == "📚 Course Questions":
        render_course_questions_page()
    else:
        render_vtu_queries_page()


if __name__ == "__main__":
    main()
