export const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/academics', label: 'Academics' },
  { to: '/admissions', label: 'Admissions' },
  { to: '/faculty', label: 'Faculty' },
  { to: '/contact', label: 'Contact' },
];

export const CONTACT = {
  address: 'Park Road, Abbottabad, Khyber Pakhtunkhwa, Pakistan',
  phone: '+92 992 383 591',
  email: 'info@comsats-abbottabad.edu.pk',
  admissionsEmail: 'admissions@comsats-abbottabad.edu.pk',
  hours: 'Monday – Friday, 8:30 AM – 4:30 PM',
};

export const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent / Guardian' },
  { value: 'faculty', label: 'Faculty / Staff' },
];

export const ROLE_LABELS = ROLES.reduce((acc, role) => {
  acc[role.value] = role.label;
  return acc;
}, {});

/**
 * Seeded on the API at first boot (backend/src/data/records.js).
 * Drives the instant-login dropdown on the sign-in page.
 */
export const DEMO_ACCOUNTS = [
  {
    label: 'Student',
    summary: 'Semester 6 · fee outstanding',
    email: 'ayesha.siddiqui@comsats-abbottabad.edu.pk',
    password: 'Student123',
  },
  {
    label: 'Student',
    summary: 'Semester 6 · all dues cleared',
    email: 'hamza.riaz@comsats-abbottabad.edu.pk',
    password: 'Student123',
  },
  {
    label: 'Parent',
    summary: 'one ward linked',
    email: 'rubina.aslam@comsats-abbottabad.edu.pk',
    password: 'Parent123',
  },
  {
    label: 'Faculty',
    summary: 'teaching load & grading',
    email: 'sadia.khan@comsats-abbottabad.edu.pk',
    password: 'Faculty123',
  },
];
