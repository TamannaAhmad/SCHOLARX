"""
Quick Start Script for Training VTU Chatbot
Runs both data processing and model training in one go
"""
import sys
import os
from pathlib import Path

def main():
    print("\n" + "="*70)
    print("VTU CHATBOT TRAINING SYSTEM")
    print("="*70 + "\n")
    
    # Check if data folder exists
    data_folder = Path("data")
    if not data_folder.exists():
        print("❌ Error: 'data' folder not found!")
        print("Please create a 'data' folder and add your PDF files.")
        return
    
    # Count PDF files
    pdf_files = list(data_folder.rglob("*.pdf"))
    if not pdf_files:
        print("❌ Error: No PDF files found in 'data' folder!")
        print("Please add PDF files to the 'data' folder.")
        return
    
    print(f"✓ Found {len(pdf_files)} PDF files in data folder\n")
    
    # Step 1: Process PDFs
    print("STEP 1: Processing PDF Files")
    print("-" * 70)
    try:
        from data_processor import PDFDataProcessor
        
        processor = PDFDataProcessor("data")
        data = processor.process_all_pdfs()
        
        if not data:
            print("❌ No data extracted from PDFs!")
            return
        
        processor.save_processed_data("processed_data.json")
        
        subjects = set(item['subject'] for item in data)
        print(f"\n✓ Processed {len(data)} text chunks")
        print(f"✓ Subjects: {', '.join(subjects)}")
        print(f"✓ Saved to: processed_data.json\n")
        
    except Exception as e:
        print(f"❌ Error processing PDFs: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 2: Train the model
    print("STEP 2: Training Chatbot Model")
    print("-" * 70)
    try:
        from chatbot_trainer import VTUChatbotTrainer
        
        trainer = VTUChatbotTrainer()
        output_path = trainer.train(
            data_file="processed_data.json",
            output_dir="trained_model"
        )
        
        print(f"\n✓ Model trained successfully!")
        print(f"✓ Saved to: {output_path}")
        print(f"✓ Total chunks indexed: {len(trainer.data)}")
        print(f"✓ Embedding dimension: {trainer.embeddings.shape[1]}\n")
        
    except Exception as e:
        print(f"❌ Error training model: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 3: Test the model
    print("STEP 3: Testing Trained Model")
    print("-" * 70)
    try:
        from chatbot_trainer import TrainedChatbot
        
        chatbot = TrainedChatbot("trained_model")
        
        test_queries = [
            "What is Big Data?",
            "Explain cloud computing",
            "What is Django?"
        ]
        
        for query in test_queries:
            print(f"\nQ: {query}")
            answer, sources = chatbot.get_answer(query, top_k=2, threshold=0.2)
            
            if answer:
                print(f"✓ Found answer from {len(sources)} sources:")
                for src in sources:
                    print(f"  - {src['subject']}: {src['filename'][:50]}... (score: {src['score']:.3f})")
            else:
                print("  No relevant information found in local data")
        
        print()
        
    except Exception as e:
        print(f"⚠️ Warning: Could not test model: {e}")
    
    # Final summary
    print("\n" + "="*70)
    print("TRAINING COMPLETE!")
    print("="*70)
    print("\n✓ Your chatbot is ready to use!")
    print("\nNext steps:")
    print("1. Run: streamlit run a.py")
    print("2. Go to 'Courses & Subjects' page")
    print("3. Ask questions about your course materials")
    print("\nThe system will:")
    print("- First search your local trained data")
    print("- Fall back to web search + Gemini if needed")
    print("- Show which textbooks the answers came from")
    print("\n" + "="*70 + "\n")


if __name__ == "__main__":
    main()
