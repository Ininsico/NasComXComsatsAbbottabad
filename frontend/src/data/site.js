import {
  Inbox,
  Kanban,
  Layers,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

export const BRAND = {
  name: 'Nascom',
  product: 'Nascom CRM',
  tagline: 'The CRM that keeps every deal moving.',
  description:
    'One pipeline, one inbox and reporting that stays in sync — for teams that sell from the field as much as the office.',
};

export const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export const CONTACT = {
  email: 'hello@artdevelopers.site',
  sales: 'sales@artdevelopers.site',
  address: 'Remote-first · Abbottabad, Pakistan',
  hours: 'Monday to Friday, 9:00 AM to 6:00 PM (PKT)',
};

export const HERO_STATS = [
  { value: '38%', label: 'faster first follow-up' },
  { value: '2.4×', label: 'more qualified leads' },
  { value: '12 min', label: 'to your first pipeline' },
];

export const FEATURES = [
  {
    icon: Inbox,
    title: 'One inbox, every channel',
    body: 'Email, WhatsApp and the website form all land on the same lead record, with the whole history in order.',
  },
  {
    icon: Kanban,
    title: 'A pipeline you can read',
    body: 'Stages, values and owners visible at a glance. A lead moves when the work moves, not when someone remembers.',
  },
  {
    icon: Workflow,
    title: 'Follow-ups that happen',
    body: 'Rules assign new leads, reopen quiet ones and nudge the owner before a deal goes cold.',
  },
  {
    icon: TrendingUp,
    title: 'Reporting without spreadsheets',
    body: 'Conversion by stage, value in play and per-rep activity, computed from the same records your team updates.',
  },
  {
    icon: MessageSquare,
    title: 'Notes that stay attached',
    body: 'Every call, email and meeting is a timestamped activity on the lead, not a message lost in someone’s phone.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles that actually hold',
    body: 'Admins manage, managers coach, reps own their book. Permissions are enforced by the API, not the menu.',
  },
];

export const MODULES = [
  {
    icon: Kanban,
    title: 'Pipeline board',
    body: 'Six stages from new to enrolled, each with a count and a value. Filter by owner, source or programme, then change a stage in one click — the change is written to the lead’s activity trail.',
  },
  {
    icon: Inbox,
    title: 'Lead capture',
    body: 'The website form creates a lead with a source, so a demo request is in the pipeline before anyone checks an inbox. Duplicate emails and bad phone numbers are rejected at the edge.',
  },
  {
    icon: MessageSquare,
    title: 'Activity trail',
    body: 'Calls, emails, meetings and notes attach to the lead with who and when. Move a lead and the stage change is recorded too, so the history explains itself.',
  },
  {
    icon: TrendingUp,
    title: 'Reporting',
    body: 'Pipeline value, enrolments this month, weekly intake and conversion rate — all derived from live records rather than a nightly export.',
  },
  {
    icon: ShieldCheck,
    title: 'Access control',
    body: 'Read access for the whole team, write access for admins and counsellors. Enforced per route, so a hidden button is never the only protection.',
  },
  {
    icon: Zap,
    title: 'Fast on a phone',
    body: 'The lead list and stage control work on a phone at a desk-less event, which is where most leads are actually captured.',
  },
  {
    icon: Layers,
    title: 'One place for data',
    body: 'Leads, activities and the people they belong to live in the same store as the rest of the platform, with the same backup and persistence rules.',
  },
  {
    icon: Users,
    title: 'Built for a small team',
    body: 'No implementation project. Import your leads, invite two people, and the pipeline is useful the same afternoon.',
  },
];

export const STEPS = [
  {
    title: 'Capture',
    body: 'Website forms, WhatsApp and manual entry create a lead with a source and an owner.',
  },
  {
    title: 'Qualify',
    body: 'Calls and notes attach to the lead. Moving a stage records who did it and when.',
  },
  {
    title: 'Close',
    body: 'Reports show conversion, value in play and which stage is leaking deals.',
  },
];

export const TESTIMONIALS = [
  {
    quote:
      'We were tracking leads in a group chat. Two weeks in, every enquiry had an owner and a next step, and nobody had to ask what happened next.',
    name: 'Ayesha Siddiqui',
    role: 'Admissions lead, 6-person team',
  },
  {
    quote:
      'The website form writing straight into the pipeline is the part that sold it. Enquiries stopped sitting in a shared inbox until Friday.',
    name: 'Hamza Riaz',
    role: 'Sales manager',
  },
  {
    quote:
      'It is the first CRM the team actually updated, because updating it takes one click instead of five fields.',
    name: 'Rubina Aslam',
    role: 'Operations',
  },
];

export const PLANS = [
  {
    name: 'Starter',
    price: 19,
    annual: 15,
    summary: 'For a founder or a two-person team finding their first repeatable sale.',
    features: [
      '3 seats',
      'One pipeline, six stages',
      'Email and website capture',
      '1,000 leads',
      'Activity trail',
      'Community support',
    ],
  },
  {
    name: 'Growth',
    price: 49,
    annual: 39,
    summary: 'For a team that lives in the pipeline and needs the whole picture.',
    highlight: true,
    features: [
      '10 seats',
      'Unlimited pipelines',
      'WhatsApp and form capture',
      '25,000 leads',
      'Automation rules',
      'Reporting and conversion',
      'Priority support',
    ],
  },
  {
    name: 'Scale',
    price: 99,
    annual: 79,
    summary: 'For teams with a process to protect and an auditor to satisfy.',
    features: [
      'Unlimited seats',
      'Unlimited leads',
      'Custom roles and permissions',
      'Audit log and SSO',
      'Data export and retention',
      'Onboarding call',
      'Priority support',
    ],
  },
];

export const FAQ = [
  {
    question: 'Can we import our existing leads?',
    answer: 'Yes — a CSV with a name and an email is enough. Everything else can be filled in later.',
  },
  {
    question: 'Do you charge per lead or per seat?',
    answer: 'Per seat, monthly or annually. Annual billing is roughly 20% cheaper, and lead limits are generous.',
  },
  {
    question: 'What happens to our data if we leave?',
    answer: 'You can export leads and activities at any time, in CSV or JSON. There is no exit fee and no export window.',
  },
  {
    question: 'Is WhatsApp really part of it?',
    answer: 'Yes. The same pipeline receives WhatsApp enquiries, and the conversation stays attached to the lead.',
  },
];

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Sign in', to: '/login' },
      { label: 'Create an account', to: '/signup' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/contact' },
    ],
  },
];

/**
 * Roles a visitor may choose at signup. Administrators are seeded, not self-registered.
 * The CRM reuses these as its access levels.
 */
export const ROLES = [
  { value: 'student', label: 'Sales rep' },
  { value: 'parent', label: 'Manager' },
  { value: 'faculty', label: 'Operations' },
];

export const ROLE_LABELS = {
  student: 'Sales rep',
  parent: 'Manager',
  faculty: 'Operations',
  admin: 'Administrator',
};

export const ADMIN_ROLE = 'admin';

/**
 * Seeded on the API at first boot (backend/src/data/records.js).
 * Drives the instant-login dropdown on the sign-in page.
 */
export const DEMO_ACCOUNTS = [
  {
    label: 'Administrator',
    summary: 'every pipeline and every record',
    email: 'admin@comsats-abbottabad.edu.pk',
    password: 'Admin12345',
  },
  {
    label: 'Sales rep',
    summary: 'owns a book of leads',
    email: 'ayesha.siddiqui@comsats-abbottabad.edu.pk',
    password: 'Student123',
  },
  {
    label: 'Sales rep',
    summary: 'second rep, separate book',
    email: 'hamza.riaz@comsats-abbottabad.edu.pk',
    password: 'Student123',
  },
  {
    label: 'Manager',
    summary: 'sees the whole team',
    email: 'rubina.aslam@comsats-abbottabad.edu.pk',
    password: 'Parent123',
  },
  {
    label: 'Operations',
    summary: 'documents and records',
    email: 'sadia.khan@comsats-abbottabad.edu.pk',
    password: 'Faculty123',
  },
];
