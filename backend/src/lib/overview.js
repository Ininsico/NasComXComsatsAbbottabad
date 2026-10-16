import { ANNOUNCEMENTS } from '../data/campus.js';
import { FACULTY_LOADS, PARENT_LINKS, STUDENT_RECORDS } from '../data/records.js';
import { findUserByEmail } from './store.js';

const GRADE_POINTS = {
  'A+': 4,
  A: 4,
  'A-': 3.67,
  'B+': 3.33,
  B: 3,
  'B-': 2.67,
  'C+': 2.33,
  C: 2,
  D: 1,
  F: 0,
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function summariseCourses(courses) {
  const registered = courses.reduce((total, course) => total + course.credits, 0);
  const graded = courses.filter((course) => course.grade);
  const gradedCredits = graded.reduce((total, course) => total + course.credits, 0);

  return {
    creditsRegistered: registered,
    creditsEarned: graded
      .filter((course) => course.grade !== 'F')
      .reduce((total, course) => total + course.credits, 0),
    gpa: gradedCredits
      ? round(
          graded.reduce(
            (total, course) => total + (GRADE_POINTS[course.grade] ?? 0) * course.credits,
            0,
          ) / gradedCredits,
        )
      : 0,
    attendance: registered
      ? Math.round(
          courses.reduce((total, course) => total + course.attendance * course.credits, 0) /
            registered,
        )
      : 0,
  };
}

const EMPTY_SUMMARY = {
  creditsRegistered: 0,
  creditsEarned: 0,
  gpa: 0,
  cgpa: 0,
  attendance: 0,
  feeStatus: 'Not billed',
  feeDue: 0,
  feeDueDate: null,
};

function studentRecordFor(email) {
  const record = STUDENT_RECORDS[email];
  if (!record) return null;

  const totals = summariseCourses(record.courses);
  const outstanding = (record.fees ?? []).find((fee) => fee.status !== 'Paid') ?? null;

  return {
    enrolment: {
      registrationNo: record.registrationNo,
      programme: record.programme,
      department: record.department,
      semester: record.semester,
      section: record.section,
      advisor: record.advisor,
      status: record.status,
      enrolmentYear: record.enrolmentYear,
    },
    summary: {
      ...totals,
      creditsEarned: record.creditsEarnedBefore + totals.creditsEarned,
      cgpa: record.cgpa,
      feeStatus: outstanding ? 'Outstanding' : 'Cleared',
      feeDue: outstanding?.amount ?? 0,
      feeDueDate: outstanding?.dueDate ?? null,
    },
    courses: record.courses,
    fees: record.fees ?? [],
  };
}

export async function buildOverview(user) {
  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
  const announcements = ANNOUNCEMENTS.slice(0, 5);

  if (user.role === 'student') {
    const record = studentRecordFor(user.email);
    return {
      kind: 'student',
      profile,
      announcements,
      enrolment: record?.enrolment ?? null,
      summary: record?.summary ?? EMPTY_SUMMARY,
      courses: record?.courses ?? [],
      fees: record?.fees ?? [],
    };
  }

  if (user.role === 'parent') {
    const wardEmails = PARENT_LINKS[user.email] ?? [];
    const wards = [];

    for (const email of wardEmails) {
      const record = studentRecordFor(email);
      if (!record) continue;
      const ward = await findUserByEmail(email);
      wards.push({ name: ward?.name ?? email, email, ...record });
    }

    return { kind: 'parent', profile, announcements, wards };
  }

  const load = FACULTY_LOADS[user.email] ?? null;

  return {
    kind: 'faculty',
    profile,
    announcements,
    teaching: load ?? {
      designation: 'Faculty member',
      department: 'Unassigned',
      office: '—',
      advisees: 0,
      pendingGrading: 0,
      coursesTaught: [],
    },
  };
}

/** Campus-wide view of every tracked student record, for the admin console. */
export async function listStudentSummaries() {
  const summaries = [];

  for (const [email, record] of Object.entries(STUDENT_RECORDS)) {
    const totals = summariseCourses(record.courses);
    const outstanding = (record.fees ?? []).find((fee) => fee.status !== 'Paid') ?? null;
    const user = await findUserByEmail(email);

    summaries.push({
      email,
      name: user?.name ?? email,
      registrationNo: record.registrationNo,
      programme: record.programme,
      semester: record.semester,
      section: record.section,
      advisor: record.advisor,
      cgpa: record.cgpa,
      gpa: totals.gpa,
      attendance: totals.attendance,
      creditsEarned: record.creditsEarnedBefore + totals.creditsEarned,
      feeStatus: outstanding ? 'Outstanding' : 'Cleared',
      feeDue: outstanding?.amount ?? 0,
      feeDueDate: outstanding?.dueDate ?? null,
    });
  }

  return summaries;
}
