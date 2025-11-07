"""
Test if the trained model loads correctly
"""
from pathlib import Path
import sys

print("=" * 60)
print("Testing Trained Model Loading")
print("=" * 60)

# Check if folder exists
model_path = Path("trained_model")
print(f"\n1. Checking path: {model_path.absolute()}")
print(f"   Exists: {model_path.exists()}")

if model_path.exists():
    # List files
    print(f"\n2. Files in trained_model:")
    for file in model_path.iterdir():
        print(f"   - {file.name} ({file.stat().st_size} bytes)")
    
    # Try to import
    print(f"\n3. Importing TrainedChatbot...")
    try:
        from chatbot_trainer import TrainedChatbot
        print("   ✅ Import successful")
        
        # Try to create instance (loads model automatically)
        print(f"\n4. Creating TrainedChatbot instance (loads model automatically)...")
        chatbot = TrainedChatbot(model_dir="trained_model")
        print("   ✅ Instance created and model loaded")
        
        # Try a test query
        print(f"\n5. Testing query...")
        answer, sources = chatbot.get_answer("What is Big Data?", top_k=2, threshold=0.3)
        
        found = answer is not None and len(sources) > 0
        if found:
            print(f"   ✅ Query successful!")
            print(f"   Found: {found}")
            print(f"   Sources: {len(sources)}")
            print(f"   Answer preview: {answer[:100]}...")
        else:
            print(f"   ⚠️ No answer found")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
else:
    print("\n❌ trained_model folder not found!")

print("\n" + "=" * 60)
print("Test Complete")
print("=" * 60)
