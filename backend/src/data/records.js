/**
 * Demo dataset.
 *
 * These accounts are written into the user store on first boot (see lib/seed.js).
 * Academic records, parent links and teaching loads are keyed by email so they stay
 * attached to the seeded accounts without hardcoding internal user ids.
 */

export const DEMO_ACCOUNTS = [
  {
    name: 'Campus Administrator',
    email: 'admin@comsats-abbottabad.edu.pk',
    password: 'Admin12345',
    role: 'admin',
  },
  {
    name: 'Ayesha Siddiqui',
    email: 'ayesha.siddiqui@comsats-abbottabad.edu.pk',
    password: 'Student123',
    role: 'student',
  },
  {
    name: 'Hamza Riaz',
    email: 'hamza.riaz@comsats-abbottabad.edu.pk',
    password: 'Student123',
    role: 'student',
  },
  {
    name: 'Rubina Aslam',
    email: 'rubina.aslam@comsats-abbottabad.edu.pk',
    password: 'Parent123',
    role: 'parent',
  },
  {
    name: 'Dr. Sadia Khan',
    email: 'sadia.khan@comsats-abbottabad.edu.pk',
    password: 'Faculty123',
    role: 'faculty',
  },
];

export const STUDENT_RECORDS = {
  'ayesha.siddiqui@comsats-abbottabad.edu.pk': {
    registrationNo: 'FA22-BSCS-0187',
    programme: 'BS Computer Science',
    department: 'Department of Computer Science',
    semester: 'Semester 6',
    section: 'A',
    advisor: 'Dr. Sadia Khan',
    status: 'Enrolled',
    cgpa: 3.62,
    creditsEarnedBefore: 102,
    enrolmentYear: '2022',
    courses: [
      { code: 'CSC-301', title: 'Design & Analysis of Algorithms', credits: 3, instructor: 'Dr. Sadia Khan', attendance: 92, marks: 84, grade: 'A' },
      { code: 'CSC-305', title: 'Database Systems', credits: 3, instructor: 'Dr. Faisal Mehmood', attendance: 88, marks: 76, grade: 'B+' },
      { code: 'CSC-307', title: 'Operating Systems', credits: 3, instructor: 'Mr. Omer Shah', attendance: 85, marks: 79, grade: 'A-' },
      { code: 'CSC-311', title: 'Web Engineering', credits: 3, instructor: 'Ms. Hina Tariq', attendance: 90, marks: 88, grade: 'A' },
      { code: 'MTH-201', title: 'Linear Algebra', credits: 3, instructor: 'Dr. Sana Tariq', attendance: 82, marks: 70, grade: 'B' },
      { code: 'HUM-101', title: 'Technical & Business Writing', credits: 2, instructor: 'Ms. Nadia Bashir', attendance: 95, marks: 90, grade: 'A' },
      { code: 'CSC-399', title: 'Final Year Project I', credits: 3, instructor: 'Dr. Sadia Khan', attendance: 100, marks: 93, grade: 'A' },
    ],
    fees: [
      { semester: 'Fall 2024', amount: 118000, dueDate: '2024-09-06', status: 'Paid' },
      { semester: 'Spring 2025', amount: 124000, dueDate: '2025-02-07', status: 'Paid' },
      { semester: 'Fall 2025', amount: 132000, dueDate: '2025-09-05', status: 'Paid' },
      { semester: 'Spring 2026', amount: 138000, dueDate: '2026-02-06', status: 'Paid' },
      { semester: 'Fall 2026', amount: 142000, dueDate: '2026-11-05', status: 'Due' },
    ],
  },
  'hamza.riaz@comsats-abbottabad.edu.pk': {
    registrationNo: 'FA22-BSCS-0042',
    programme: 'BS Computer Science',
    department: 'Department of Computer Science',
    semester: 'Semester 6',
    section: 'B',
    advisor: 'Dr. Faisal Mehmood',
    status: 'Enrolled',
    cgpa: 3.91,
    creditsEarnedBefore: 104,
    enrolmentYear: '2022',
    courses: [
      { code: 'CSC-301', title: 'Design & Analysis of Algorithms', credits: 3, instructor: 'Dr. Sadia Khan', attendance: 96, marks: 91, grade: 'A' },
      { code: 'CSC-305', title: 'Database Systems', credits: 3, instructor: 'Dr. Faisal Mehmood', attendance: 94, marks: 88, grade: 'A' },
      { code: 'CSC-307', title: 'Operating Systems', credits: 3, instructor: 'Mr. Omer Shah', attendance: 92, marks: 85, grade: 'A' },
      { code: 'CSC-311', title: 'Web Engineering', credits: 3, instructor: 'Ms. Hina Tariq', attendance: 95, marks: 89, grade: 'A' },
      { code: 'MTH-201', title: 'Linear Algebra', credits: 3, instructor: 'Dr. Sana Tariq', attendance: 90, marks: 84, grade: 'A' },
      { code: 'HUM-101', title: 'Technical & Business Writing', credits: 2, instructor: 'Ms. Nadia Bashir', attendance: 98, marks: 92, grade: 'A' },
      { code: 'CSC-399', title: 'Final Year Project I', credits: 3, instructor: 'Dr. Sadia Khan', attendance: 100, marks: 95, grade: 'A' },
    ],
    fees: [
      { semester: 'Fall 2024', amount: 118000, dueDate: '2024-09-06', status: 'Paid' },
      { semester: 'Spring 2025', amount: 124000, dueDate: '2025-02-07', status: 'Paid' },
      { semester: 'Fall 2025', amount: 132000, dueDate: '2025-09-05', status: 'Paid' },
      { semester: 'Spring 2026', amount: 138000, dueDate: '2026-02-06', status: 'Paid' },
      { semester: 'Fall 2026', amount: 142000, dueDate: '2026-11-05', status: 'Paid' },
    ],
  },
};

/** Parent email -> ward emails. */
export const PARENT_LINKS = {
  'rubina.aslam@comsats-abbottabad.edu.pk': ['ayesha.siddiqui@comsats-abbottabad.edu.pk'],
};

/** Faculty email -> teaching load. */
export const FACULTY_LOADS = {
  'sadia.khan@comsats-abbottabad.edu.pk': {
    designation: 'Associate Professor & Head',
    department: 'Department of Computer Science',
    office: 'Block B, Room 204',
    advisees: 14,
    pendingGrading: 58,
    coursesTaught: [
      { code: 'CSC-301', title: 'Design & Analysis of Algorithms', semester: 'Fall 2026', enrolled: 58, attendanceMarked: true },
      { code: 'CSC-399', title: 'Final Year Project I', semester: 'Fall 2026', enrolled: 9, attendanceMarked: false },
      { code: 'CSC-501', title: 'Machine Learning (MS)', semester: 'Fall 2026', enrolled: 22, attendanceMarked: true },
    ],
  },
};
