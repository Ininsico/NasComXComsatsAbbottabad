import {
  Bell,
  BookOpen,
  Building,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  GraduationCap,
  IdCard,
  RefreshCw,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import { useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import AssistantCard from '../components/AssistantCard.jsx';
import AsyncSection from '../components/AsyncSection.jsx';
import { useAuth } from '../context/authContext.js';
import { ADMIN_ROLE } from '../data/site.js';
import useApiResource from '../hooks/useApiResource.js';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate, percent } from '../lib/format.js';

const TINTED = new Set(['amber', 'emerald', 'rose']);

function attendanceTone(value) {
  return value >= 75 ? 'emerald' : 'rose';
}

function feeTone(status) {
  return status === 'Cleared' ? 'emerald' : 'amber';
}

function Tile({ icon: Icon, label, value, tone = 'blue' }) {
  return (
    <div className={`tile${TINTED.has(tone) ? ` tint-${tone}` : ''}`}>
      <span className={`tile__icon tile__icon--${tone}`} aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h2 className="dash-section__title">
      <Icon size={17} aria-hidden="true" />
      {children}
    </h2>
  );
}

function Announcements({ announcements }) {
  if (!announcements?.length) return null;

  return (
    <section className="dash-section">
      <SectionTitle icon={Bell}>Announcements</SectionTitle>
      <ul className="notice-list">
        {announcements.map((item) => (
          <li key={item.id}>
            <div className="notice__meta">
              <span className="badge">{item.category}</span>
              <time dateTime={item.date}>{formatDate(item.date)}</time>
            </div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudentView({ enrolment, summary, courses, fees }) {
  if (!enrolment) {
    return (
      <p className="alert alert--info">
        <IdCard size={15} aria-hidden="true" />
        No enrolment record is linked to this account yet. Once admissions confirms your
        registration number, your timetable, attendance and results will appear here.
      </p>
    );
  }

  return (
    <>
      <div className="dash-grid">
        <Tile icon={TrendingUp} label="Semester GPA" value={summary.gpa.toFixed(2)} />
        <Tile icon={GraduationCap} label="CGPA" value={summary.cgpa.toFixed(2)} />
        <Tile
          icon={CalendarCheck}
          label="Attendance"
          value={percent(summary.attendance)}
          tone={attendanceTone(summary.attendance)}
        />
        <Tile icon={BookOpen} label="Credits earned" value={summary.creditsEarned} />
        <Tile
          icon={CreditCard}
          label="Fee status"
          value={summary.feeStatus}
          tone={feeTone(summary.feeStatus)}
        />
      </div>

      <section className="dash-section">
        <SectionTitle icon={IdCard}>Enrolment</SectionTitle>
        <ul className="info-list info-list--grid">
          <li>
            <strong>Registration no.</strong>
            <span>{enrolment.registrationNo}</span>
          </li>
          <li>
            <strong>Programme</strong>
            <span>{enrolment.programme}</span>
          </li>
          <li>
            <strong>Department</strong>
            <span>{enrolment.department}</span>
          </li>
          <li>
            <strong>Semester</strong>
            <span>
              {enrolment.semester} · Section {enrolment.section}
            </span>
          </li>
          <li>
            <strong>Advisor</strong>
            <span>{enrolment.advisor}</span>
          </li>
          <li>
            <strong>Status</strong>
            <span>
              <span className="pill pill--done">{enrolment.status}</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="dash-section">
        <SectionTitle icon={BookOpen}>Current courses</SectionTitle>
        <div className="table-wrap">
          <table className="table">
            <caption>
              Fall 2026 · {summary.creditsRegistered} credit hours registered
            </caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Course</th>
                <th scope="col">Cr.</th>
                <th scope="col">Instructor</th>
                <th scope="col">Attendance</th>
                <th scope="col">Marks</th>
                <th scope="col">Grade</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.code}>
                  <th scope="row">{course.code}</th>
                  <td>{course.title}</td>
                  <td>{course.credits}</td>
                  <td>{course.instructor}</td>
                  <td>
                    <span className={`pill pill--${attendanceTone(course.attendance) === 'emerald' ? 'done' : 'problem'}`}>
                      {percent(course.attendance)}
                    </span>
                  </td>
                  <td>{course.marks}</td>
                  <td>
                    <span className="pill pill--neutral">{course.grade}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section">
        <SectionTitle icon={CreditCard}>Fee history</SectionTitle>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Semester</th>
                <th scope="col">Amount</th>
                <th scope="col">Due date</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.semester}>
                  <th scope="row">{fee.semester}</th>
                  <td>{formatCurrency(fee.amount)}</td>
                  <td>{formatDate(fee.dueDate)}</td>
                  <td>
                    <span
                      className={`pill ${fee.status === 'Paid' ? 'pill--done' : 'pill--pending'}`}
                    >
                      {fee.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {summary.feeDue > 0 ? (
          <p className="alert alert--pending" style={{ marginTop: '1rem' }}>
            <CreditCard size={15} aria-hidden="true" />
            {formatCurrency(summary.feeDue)} outstanding for the current semester, due{' '}
            {formatDate(summary.feeDueDate)}.
          </p>
        ) : null}
      </section>
    </>
  );
}

function ParentView({ wards }) {
  if (!wards.length) {
    return (
      <p className="alert alert--info">
        <Users size={15} aria-hidden="true" />
        No wards are linked to this account yet. Contact the registrar to link your child’s record.
      </p>
    );
  }

  return wards.map((ward) => (
    <section className="dash-section" key={ward.email}>
      <SectionTitle icon={Users}>{ward.name}</SectionTitle>
      <div className="dash-grid">
        <Tile icon={IdCard} label="Registration no." value={ward.enrolment.registrationNo} />
        <Tile icon={BookOpen} label="Programme" value={ward.enrolment.programme} />
        <Tile icon={TrendingUp} label="CGPA" value={ward.summary.cgpa.toFixed(2)} />
        <Tile
          icon={CalendarCheck}
          label="Attendance"
          value={percent(ward.summary.attendance)}
          tone={attendanceTone(ward.summary.attendance)}
        />
        <Tile
          icon={CreditCard}
          label="Fee status"
          value={ward.summary.feeStatus}
          tone={feeTone(ward.summary.feeStatus)}
        />
      </div>

      {ward.summary.feeDue > 0 ? (
        <p className="alert alert--pending" style={{ marginTop: '1rem' }}>
          <CreditCard size={15} aria-hidden="true" />
          {formatCurrency(ward.summary.feeDue)} outstanding, due{' '}
          {formatDate(ward.summary.feeDueDate)}.
        </p>
      ) : (
        <p className="alert alert--success" style={{ marginTop: '1rem' }}>
          <CalendarCheck size={15} aria-hidden="true" />
          All dues cleared for {ward.enrolment.semester}.
        </p>
      )}
    </section>
  ));
}

function FacultyView({ teaching }) {
  return (
    <>
      <div className="dash-grid">
        <Tile icon={UserCog} label="Designation" value={teaching.designation} />
        <Tile icon={Building} label="Department" value={teaching.department} />
        <Tile icon={Users} label="Advisees" value={teaching.advisees} />
        <Tile
          icon={ClipboardList}
          label="Awaiting grading"
          value={teaching.pendingGrading}
          tone={teaching.pendingGrading > 0 ? 'amber' : 'emerald'}
        />
      </div>

      <section className="dash-section">
        <SectionTitle icon={BookOpen}>Courses taught</SectionTitle>
        {teaching.coursesTaught.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <caption>Fall 2026 teaching load · Office {teaching.office}</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Course</th>
                  <th scope="col">Semester</th>
                  <th scope="col">Enrolled</th>
                  <th scope="col">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {teaching.coursesTaught.map((course) => (
                  <tr key={course.code}>
                    <th scope="row">{course.code}</th>
                    <td>{course.title}</td>
                    <td>{course.semester}</td>
                    <td>{course.enrolled}</td>
                    <td>
                      <span
                        className={`pill ${course.attendanceMarked ? 'pill--done' : 'pill--pending'}`}
                      >
                        {course.attendanceMarked ? 'Marked' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="alert alert--info">
            <ClipboardList size={15} aria-hidden="true" />
            No teaching load has been assigned yet.
          </p>
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const { user, token } = useAuth();
  const loadOverview = useCallback(() => api.overview(token), [token]);
  const { data, error, loading, reload } = useApiResource(loadOverview);

  if (user.role === ADMIN_ROLE) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Welcome, {user.name.split(' ')[0]}</h1>
          <p>Here is your record for the current semester.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={reload}
        shape="tiles"
        count={5}
        label="Loading your dashboard"
        errorTitle="We could not load your dashboard"
      >
        {data ? (
          <>
            {data.kind === 'student' ? (
              <StudentView
                enrolment={data.enrolment}
                summary={data.summary}
                courses={data.courses}
                fees={data.fees}
              />
            ) : null}

            {data.kind === 'parent' ? <ParentView wards={data.wards} /> : null}

            {data.kind === 'faculty' ? <FacultyView teaching={data.teaching} /> : null}

            <Announcements announcements={data.announcements} />
          </>
        ) : null}
      </AsyncSection>

      <div className="dash-section">
        <AssistantCard />
      </div>
    </>
  );
}
