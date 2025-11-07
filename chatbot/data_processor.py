"""
Data Processor for VTU Chatbot
Extracts text from PDFs and prepares training data
"""
import os
import json
import pickle
from pathlib import Path
from typing import List, Dict, Tuple
import PyPDF2
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PDFDataProcessor:
    """Process PDF files and extract text content"""
    
    def __init__(self, data_folder: str = "data"):
        self.data_folder = Path(data_folder)
        self.processed_data = []
        
    def extract_text_from_pdf(self, pdf_path: Path) -> str:
        """Extract text from a single PDF file"""
        try:
            text = ""
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                num_pages = len(pdf_reader.pages)
                
                logger.info(f"Processing {pdf_path.name} ({num_pages} pages)")
                
                for page_num in range(num_pages):
                    try:
                        page = pdf_reader.pages[page_num]
                        text += page.extract_text() + "\n"
                    except Exception as e:
                        logger.warning(f"Error extracting page {page_num} from {pdf_path.name}: {e}")
                        continue
                        
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing {pdf_path}: {e}")
            return ""
    
    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks"""
        chunks = []
        words = text.split()
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = ' '.join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk.strip())
                
        return chunks
    
    def process_all_pdfs(self) -> List[Dict]:
        """Process all PDFs in the data folder"""
        pdf_files = list(self.data_folder.rglob("*.pdf"))
        logger.info(f"Found {len(pdf_files)} PDF files")
        
        all_data = []
        
        for pdf_path in pdf_files:
            # Extract subject/topic from folder structure
            relative_path = pdf_path.relative_to(self.data_folder)
            subject = relative_path.parts[1] if len(relative_path.parts) > 1 else "General"
            
            logger.info(f"Processing: {pdf_path.name} (Subject: {subject})")
            
            # Extract text
            text = self.extract_text_from_pdf(pdf_path)
            
            if not text:
                logger.warning(f"No text extracted from {pdf_path.name}")
                continue
            
            # Chunk the text
            chunks = self.chunk_text(text)
            
            # Store metadata with each chunk
            for i, chunk in enumerate(chunks):
                all_data.append({
                    'subject': subject,
                    'filename': pdf_path.name,
                    'chunk_id': i,
                    'text': chunk,
                    'source': str(pdf_path)
                })
            
            logger.info(f"Created {len(chunks)} chunks from {pdf_path.name}")
        
        self.processed_data = all_data
        return all_data
    
    def save_processed_data(self, output_file: str = "processed_data.json"):
        """Save processed data to JSON file"""
        output_path = Path(output_file)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(self.processed_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved {len(self.processed_data)} chunks to {output_path}")
        return output_path
    
    def load_processed_data(self, input_file: str = "processed_data.json") -> List[Dict]:
        """Load processed data from JSON file"""
        input_path = Path(input_file)
        
        if not input_path.exists():
            logger.warning(f"File {input_path} not found")
            return []
        
        with open(input_path, 'r', encoding='utf-8') as f:
            self.processed_data = json.load(f)
        
        logger.info(f"Loaded {len(self.processed_data)} chunks from {input_path}")
        return self.processed_data


def main():
    """Main function to process PDFs"""
    processor = PDFDataProcessor("data")
    
    # Process all PDFs
    data = processor.process_all_pdfs()
    
    # Save processed data
    processor.save_processed_data("processed_data.json")
    
    # Print summary
    subjects = set(item['subject'] for item in data)
    print(f"\n{'='*50}")
    print(f"Processing Complete!")
    print(f"{'='*50}")
    print(f"Total chunks created: {len(data)}")
    print(f"Subjects covered: {', '.join(subjects)}")
    print(f"Data saved to: processed_data.json")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
