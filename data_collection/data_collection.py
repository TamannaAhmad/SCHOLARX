import streamlit as st
from db_connection import get_db_connection, get_departments, initialize_database
from datetime import time
from typing import List, Dict, Any

# Page config
st.set_page_config(
    page_title="ScholarX - User Data Collection",
    page_icon="🎓",
    layout="wide"
)

# Initialize session state
if 'form_submitted' not in st.session_state:
    st.session_state.form_submitted = False

if 'current_step' not in st.session_state:
    st.session_state.current_step = 'personal_info'

# Initialize database
initialize_database()

# Initialize the connection
@st.cache_resource
def init_connection():
    return get_db_connection()

conn = init_connection()

# Constants
TIME_SLOTS = [
    (time(9, 0), time(11, 0)),   # 9 AM - 11 AM
    (time(11, 0), time(13, 0)),  # 11 AM - 1 PM
    (time(13, 0), time(15, 0)),  # 1 PM - 3 PM
    (time(15, 0), time(17, 0)),  # 3 PM - 5 PM
    (time(17, 0), time(19, 0)),  # 5 PM - 7 PM
    (time(19, 0), time(21, 0)),  # 7 PM - 9 PM
    (time(21, 0), time(23, 0))   # 9 PM - 11 PM
]
DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
DAY_TO_INT = {day: i for i, day in enumerate(DAYS_OF_WEEK)}

# INITIALIZE FORM DATA
@st.cache_data(ttl=3600)
def get_skills() -> List[str]:
    """retrieve all skills from database to generate suggestions"""
    try:
        result = conn.table('skills').select('name').order('name').execute() # retrive skills in alphabetical order
        return [row['name'] for row in result.data]
    except Exception as e:
        st.error(f"Error fetching skills: {e}")
        return []
    
def create_availability_grid() -> Dict[str, List[bool]]:
    """Create an empty availability grid"""
    return {day: [False] * len(TIME_SLOTS) for day in DAYS_OF_WEEK}
    
if 'initialized' not in st.session_state:
    st.session_state.initialized = True
    st.session_state.form_data = {
        'availability': create_availability_grid(),
        'skills': []
    }

# RENDER FORM LAYOUTS
def render_skills_section():
    """Render the skills section"""
    if st.button("← Back to Personal Info"):
        st.session_state.current_step = 'personal_info'
        st.rerun()
    st.markdown('---')

    st.header("Skills")
    
    all_skills = get_skills()
    skills = st.session_state.form_data['skills']
    
    # Add new skill section
    st.subheader("Add Skills")
    col1, col2 = st.columns([3, 1])
    
    with col1:
        skill_options = [""] + all_skills + ["+ Add Custom Skill"] # blank option, list of skils, and custom skill option
        selected_skill = st.selectbox(
            "Select or type a skill",
            options=skill_options,
            key="skill_selector"
        )
        
        # allow users to add skills not already present in the database
        if selected_skill == "+ Add Custom Skill":
            custom_skill = st.text_input(
                "Enter custom skill name",
                key="custom_skill_input",
                placeholder="e.g., Machine Learning, React.js"
            )
            skill_to_add = custom_skill.strip().title() if custom_skill else ""
        else:
            skill_to_add = selected_skill
    
    with col2:
        proficiency_level = st.slider(
            "Proficiency Level",
            min_value=0,
            max_value=5,
            value=3,
            key="new_skill_proficiency",
            help="0 = Yet to Start, 1-2 = Learning, 3-5 = Proficient"
        )
    
    # Add skill button
    if st.button("Add Skill", key="add_skill_btn"):
        if skill_to_add:
            existing_skill_names = [s['name'].lower() for s in skills] # check if skill is already in user's list
            if skill_to_add.lower() not in existing_skill_names:
                skills.append({
                    'name': skill_to_add,
                    'proficiency_level': proficiency_level
                })
                st.session_state.form_data['skills'] = skills
                st.success(f"Added {skill_to_add}")
                st.rerun()
            else:
                st.warning("This skill is already in your list")
        else:
            st.warning("Please enter a skill name")
    
    # Display current skills
    if skills:
        st.subheader("Your Skills")
        for i, skill_data in enumerate(skills):
            col1, col2, col3 = st.columns([3, 2, 1])
            with col1:
                st.write(f"**{skill_data['name']}**")
            with col2:
                # allows user to change proficiency even after adding a skill
                new_proficiency = st.slider(
                    "Proficiency",
                    min_value=0,
                    max_value=5,
                    value=skill_data.get('proficiency_level', 3),
                    key=f"skill_prof_{i}_{skill_data['name']}",
                    help="0 = Yet to Start, 1-2 = Learning, 3-5 = Proficient"
                )
                if new_proficiency != skill_data.get('proficiency_level', 3):
                    st.session_state.form_data['skills'][i]['proficiency_level'] = new_proficiency
            
            with col3:
                if st.button("Remove", key=f"remove_skill_{i}_{skill_data['name']}"):
                    st.session_state.form_data['skills'].pop(i)
                    st.success(f"Removed {skill_data['name']}")
                    st.rerun()
    
    # Navigation buttons
    st.markdown("---")

    if st.button("Continue to Availability →", type="primary"):
        if not st.session_state.form_data.get('skills'):
            st.error("Please add at least one skill before continuing.")
        else:
            st.session_state.current_step = 'availability'
            st.rerun()

def render_availability_grid():
    """Render availability grid"""
    st.subheader("Available Times")
    st.info("Please select all time slots when you are typically available for study groups.")
    
    # Create header
    cols = st.columns([2] + [1] * len(DAYS_OF_WEEK)) 
    cols[0].write("**Time Slot**")
    for i, day in enumerate(DAYS_OF_WEEK):
        cols[i + 1].write(f"**{day}**")
    
    # Create each row 
    for time_idx, (start, end) in enumerate(TIME_SLOTS):
        cols = st.columns([2] + [1] * len(DAYS_OF_WEEK))
        
        # Time labels
        time_label = f"{start.strftime('%I:%M %p')} - {end.strftime('%I:%M %p')}"
        with cols[0]:
            # used padding to align checkboxes with time slots
            st.markdown(f'<div style="padding-top: 2px; padding-bottom: 15px;">{time_label}</div>', 
                       unsafe_allow_html=True)
        
        # Checkboxes for each day
        for day_idx, day in enumerate(DAYS_OF_WEEK):
            with cols[day_idx + 1]:
                key = f"availability_{day}_{time_idx}"
                current_value = st.session_state.form_data['availability'][day][time_idx]
                
                new_value = st.checkbox(
                    "",
                    key=key,
                    value=current_value,
                    label_visibility="collapsed"
                )
                
                # Update session state
                st.session_state.form_data['availability'][day][time_idx] = new_value

def save_user_data(form_data: Dict[str, Any]) -> bool:
    """Save user data in the database"""
    try:
        # Prepare user data
        user_data = {
            'usn': form_data['usn'].upper(),
            'first_name': form_data['first_name'].title(),
            'last_name': form_data['last_name'].title(),
            'department': form_data['department'],
            'year': form_data['year']
        }
        
        # Upsert user data
        conn.table('sample_users').upsert(user_data, on_conflict='usn').execute()
        
        # Handle skills
        for skill_data in form_data['skills']:
            skill_name = skill_data['name'].strip()
            if not skill_name:
                continue
                
            # Get or create skill
            skill_result = conn.table('skills').select('skill_id').eq('name', skill_name).execute()
            if not skill_result.data:
                new_skill = conn.table('skills').insert({'name': skill_name}).execute()
                skill_id = new_skill.data[0]['skill_id']
            else:
                skill_id = skill_result.data[0]['skill_id']
            
            # Upsert user-skill relationship
            user_skill_data = {
                'usn': user_data['usn'],
                'skill_id': skill_id,
                'proficiency_level': skill_data['proficiency_level']
            }
            conn.table('sample_user_skills').upsert(user_skill_data, on_conflict='usn,skill_id').execute()
        
        # Handle availability - clear existing first
        conn.table('sample_user_availability').delete().eq('usn', user_data['usn']).execute()
        
        # Insert new availability
        availability_records = []
        for day, slots in form_data['availability'].items():
            day_int = DAY_TO_INT[day]
            for i, is_available in enumerate(slots):
                if is_available:
                    start_time = TIME_SLOTS[i][0]
                    end_time = TIME_SLOTS[i][1]
                    availability_records.append({
                        'usn': user_data['usn'],
                        'day_of_week': day_int,
                        'time_slot_start': start_time.strftime('%H:%M:%S'),
                        'time_slot_end': end_time.strftime('%H:%M:%S'),
                        'is_available': True
                    })
        
        if availability_records:
            conn.table('sample_user_availability').insert(availability_records).execute()
        
        return True
            
    except Exception as e:
        raise e

def main():
    st.title("🎓 ScholarX - User Data Collection")
    
    if st.session_state.form_submitted:
        st.success("Thank you for submitting your information!")
        if st.button("Submit another response"):
            st.session_state.form_submitted = False
            st.session_state.current_step = 'personal_info'
            st.session_state.form_data = {
                'availability': create_availability_grid(),
                'skills': []
            }
            st.rerun()
        return
    
    # Step 1: Personal Information
    if st.session_state.current_step == 'personal_info':
        with st.form("personal_info_form"):
            st.header("Personal Information")
            
            col1, col2 = st.columns(2)
            with col1:
                usn = st.text_input("USN (10 characters)", 
                                  max_chars=10,
                                  value=st.session_state.form_data.get('usn', ''))
                first_name = st.text_input("First Name",
                                         value=st.session_state.form_data.get('first_name', ''))
            
            with col2:
                last_name = st.text_input("Last Name",
                                        value=st.session_state.form_data.get('last_name', ''))
                department = st.selectbox("Department", get_departments())
                year = st.selectbox("Year of Study", [1, 2, 3, 4])
            
            submitted = st.form_submit_button("Continue to Skills", type="primary")
            
            if submitted:
                if not all([usn, first_name, last_name]):
                    st.error("Please fill in all required fields.")
                elif len(usn) != 10:
                    st.error("USN must be exactly 10 characters long.")
                else:
                    st.session_state.form_data.update({
                        'usn': usn.upper(),
                        'first_name': first_name.title(),
                        'last_name': last_name.title(),
                        'department': department,
                        'year': year
                    })
                    st.session_state.current_step = 'skills'
                    st.rerun()
    
    # Step 2: Skills
    elif st.session_state.current_step == 'skills':
        render_skills_section()
    
    # Step 3: Availability
    elif st.session_state.current_step == 'availability':
        if st.button("← Back to Skills"):
            st.session_state.current_step = 'skills'
            st.rerun()
        
        st.header("Availability")
        
        with st.form("availability_form"):
            render_availability_grid()
            
            if st.form_submit_button("Submit All Information", type="primary"):
                try:
                    if save_user_data(st.session_state.form_data):
                        st.session_state.form_submitted = True
                        st.rerun()
                except Exception as e:
                    error_msg = str(e).lower()
                    if "duplicate key" in error_msg:
                        st.error("This USN is already registered. Please use a different USN.")
                    elif "connection" in error_msg or "database" in error_msg:
                        st.error("Database connection error. Please try again.")
                    else:
                        st.error(f"An unexpected error occurred. Please try again. Error: {str(e)}")

if __name__ == "__main__":
    main()