import streamlit as st
import psycopg2
from db_connection import get_db_connection, get_departments, get_skills, initialize_database
from datetime import time
import os
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

# Initialize database
initialize_database()

# Constants
DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TIME_SLOTS = [time(hour=h, minute=0) for h in range(9, 24)]  # 9 AM to 11 PM

def create_availability_grid() -> Dict[str, List[bool]]:
    """Create an empty availability grid"""
    return {day: [False] * len(TIME_SLOTS) for day in DAYS_OF_WEEK}

# Initialize form data in session state
if 'form_data' not in st.session_state:
    st.session_state.form_data = {
        'availability': create_availability_grid(),
        'avoid_times': create_availability_grid()
    }

def save_user_data(form_data: Dict[str, Any]) -> bool:
    """Save user data to the database"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Insert user data
        cur.execute("""
            INSERT INTO sample_users (usn, first_name, last_name, department, year)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (usn) DO NOTHING
            RETURNING usn
        """, (
            form_data['usn'].upper(),
            form_data['first_name'],
            form_data['last_name'],
            form_data['department'],
            form_data['year']
        ))
        
        # Get skills lists
        proficiency_levels = {
            'proficient': form_data.get('proficient_skills', []),
            'learning': form_data.get('learning_skills', []),
            'wants_to_learn': form_data.get('wants_to_learn_skills', [])
        }
        
        # Insert skills
        for proficiency_level, skills in proficiency_levels.items():
            for skill in skills:
                # Get or create skill
                cur.execute("""
                    INSERT INTO skills (name)
                    VALUES (%s)
                    ON CONFLICT (name) DO NOTHING
                    RETURNING skill_id
                """, (skill,))
                
                skill_id = cur.fetchone()
                if not skill_id:
                    cur.execute("SELECT skill_id FROM skills WHERE name = %s", (skill,))
                    skill_id = cur.fetchone()[0]
                else:
                    skill_id = skill_id[0]
                
                # Link skill to user
                cur.execute("""
                    INSERT INTO sample_user_skills (usn, skill_id, proficiency_level)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (form_data['usn'].upper(), skill_id, proficiency_level))
        
        # Insert availability
        for day_idx, day in enumerate(DAYS_OF_WEEK):
            for time_idx, time_slot in enumerate(TIME_SLOTS):
                # Available times
                cur.execute("""
                    INSERT INTO sample_user_availability 
                    (usn, day_of_week, time_slot_start, time_slot_end, is_available)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    form_data['usn'].upper(),
                    day_idx,
                    time_slot,
                    (time(time_slot.hour + 1, 0) if time_slot.hour < 23 else time(23, 59)),
                    form_data['availability'][day][time_idx]
                ))
                
                # Times to avoid
                cur.execute("""
                    INSERT INTO sample_user_availability 
                    (usn, day_of_week, time_slot_start, time_slot_end, is_available)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    form_data['usn'].upper(),
                    day_idx,
                    time_slot,
                    (time(time_slot.hour + 1, 0) if time_slot.hour < 23 else time(23, 59)),
                    not form_data['avoid_times'][day][time_idx]  # Invert since this is for "avoid" times
                ))
        
        conn.commit()
        return True
        
    except Exception as e:
        st.error(f"Error saving data: {str(e)}")
        if conn:
            conn.rollback()
        return False
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

def render_availability_grid(grid_name: str, title: str):
    """Render a grid for availability or avoid times"""
    st.subheader(title)
    
    # Create columns for each day
    cols = st.columns(len(DAYS_OF_WEEK) + 1)  # +1 for time labels
    
    # Time labels
    with cols[0]:
        st.write("Time")
        for i, time_slot in enumerate(TIME_SLOTS):
            st.write(f"{time_slot.strftime('%I:%M %p')}")
    
    # Day columns with checkboxes
    for day_idx, day in enumerate(DAYS_OF_WEEK, 1):
        with cols[day_idx]:
            st.write(day)
            for time_idx, time_slot in enumerate(TIME_SLOTS):
                # Create a unique key for each checkbox
                key = f"{grid_name}_{day}_{time_idx}"
                checked = st.session_state.form_data[grid_name][day][time_idx]
                
                # Update session state when checkbox is toggled
                if st.checkbox(
                    "",
                    key=key,
                    value=checked,
                    label_visibility="collapsed"
                ):
                    st.session_state.form_data[grid_name][day][time_idx] = True
                else:
                    st.session_state.form_data[grid_name][day][time_idx] = False

def main():
    st.title("🎓 ScholarX - User Data Collection")
    
    if st.session_state.form_submitted:
        st.success("Thank you for submitting your information!")
        st.balloons()
        if st.button("Submit another response"):
            st.session_state.form_submitted = False
            st.session_state.form_data = {
                'availability': create_availability_grid(),
                'avoid_times': create_availability_grid()
            }
            st.rerun()
        return
    
    with st.form("user_data_form"):
        st.header("Personal Information")
        
        # Basic info
        col1, col2 = st.columns(2)
        with col1:
            usn = st.text_input("USN (10 characters)", 
                              max_chars=10,
                              value=st.session_state.form_data.get('usn', ''),
                              help="Enter your 10-character University Seat Number")
            
            first_name = st.text_input("First Name",
                                     value=st.session_state.form_data.get('first_name', ''))
        
        with col2:
            last_name = st.text_input("Last Name",
                                    value=st.session_state.form_data.get('last_name', ''))
            
            department = st.selectbox(
                "Department",
                get_departments(),
                index=get_departments().index(st.session_state.form_data.get('department', 'Computer Science')) 
                if st.session_state.form_data.get('department') in get_departments() 
                else 0
            )
            
            year = st.selectbox(
                "Year of Study",
                [1, 2, 3, 4],
                index=st.session_state.form_data.get('year', 1) - 1 if 'year' in st.session_state.form_data else 0
            )
        
        # Skills section
        st.header("Skills Information")
        skills = get_skills()
        
        st.subheader("Proficient Skills")
        proficient_skills = st.multiselect(
            "Select skills you're proficient in:",
            skills,
            default=st.session_state.form_data.get('proficient_skills', []),
            key="proficient_skills"
        )
        
        st.subheader("Currently Learning")
        learning_skills = st.multiselect(
            "Select skills you're currently learning:",
            skills,
            default=st.session_state.form_data.get('learning_skills', []),
            key="learning_skills"
        )
        
        st.subheader("Want to Learn")
        wants_to_learn_skills = st.multiselect(
            "Select skills you want to learn:",
            skills,
            default=st.session_state.form_data.get('wants_to_learn_skills', []),
            key="wants_to_learn_skills"
        )
        
        # Availability section
        st.header("Availability")
        st.info("Please select all time slots when you are typically available for study groups.")
        render_availability_grid('availability', "Available Times")
        
        # Times to avoid
        st.header("Times to Avoid")
        st.info("Please select all time slots when you are typically NOT available for study groups.")
        render_availability_grid('avoid_times', "Unavailable Times")
        
        # Form submission
        submitted = st.form_submit_button("Submit")
        
        if submitted:
            # Basic validation
            if not all([usn, first_name, last_name, department, year]):
                st.error("Please fill in all required fields.")
            elif len(usn) != 10:
                st.error("USN must be exactly 10 characters long.")
            else:
                # Update form data in session state
                form_data = {
                    'usn': usn.upper(),
                    'first_name': first_name,
                    'last_name': last_name,
                    'department': department,
                    'year': year,
                    'proficient_skills': proficient_skills,
                    'learning_skills': learning_skills,
                    'wants_to_learn_skills': wants_to_learn_skills,
                    'availability': st.session_state.form_data['availability'],
                    'avoid_times': st.session_state.form_data['avoid_times']
                }
                
                if save_user_data(form_data):
                    st.session_state.form_submitted = True
                    st.rerun()
                else:
                    st.error("There was an error saving your data. Please try again.")

if __name__ == "__main__":
    main()