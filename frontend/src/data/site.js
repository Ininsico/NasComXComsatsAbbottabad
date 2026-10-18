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
    body: 'Every stage from new to won, each with a count and a value. Filter by owner, source or tag, then move an opportunity in one click — the change is written to the activity trail, and a stage whose required fields are missing refuses the move and says which.',
  },
  {
    icon: Inbox,
    title: 'Lead capture',
    body: 'The website form creates a contact and an opportunity with a source, so a demo request is in the pipeline before anyone checks an inbox. Duplicate emails and bad phone numbers are rejected at the edge.',
  },
  {
    icon: MessageSquare,
    title: 'Activity trail',
    body: 'Calls, emails, meetings, messages and notes attach to the record with who and when. Stage changes, assignments and payments are recorded too, so the history explains itself.',
  },
  {
    icon: TrendingUp,
    title: 'Reporting',
    body: 'Pipeline value, wins this month, average time to first response and conversion rate — all derived from live records rather than a nightly export.',
  },
  {
    icon: ShieldCheck,
    title: 'Access control',
    body: 'Owners, admins and members, plus any role you build from permission bundles. Opportunity value can be withheld from a role, and the server omits it rather than hiding a button.',
  },
  {
    icon: Zap,
    title: 'Recovery queue',
    body: 'Anything unacknowledged past its deadline, escalated twice or untouched for too long is listed with the reason, so nothing quietly rots in the pipeline.',
  },
  {
    icon: Layers,
    title: 'One place for data',
    body: 'Companies, contacts, opportunities, messages, appointments and payments live in the same store, with the same backup and access rules.',
  },
  {
    icon: Users,
    title: 'Built for a small team',
    body: 'No implementation project. Import your contacts, invite two people, and the pipeline is useful the same afternoon.',
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
    role: 'Revenue lead, 6-person team',
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
      '1,000 contacts',
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
      'Three pipelines',
      'WhatsApp and form capture',
      '10,000 contacts',
      'Escalation ladders and alerts',
      'Reporting and conversion',
      'Priority support',
    ],
  },
  {
    name: 'Scale',
    price: 129,
    annual: 105,
    summary: 'For teams with a process to protect and an auditor to satisfy.',
    features: [
      '100 seats',
      '25 pipelines',
      '250,000 contacts',
      'Custom roles and permissions',
      'Tamper-evident audit log',
      'Data export and retention',
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
 * The access levels a member can hold. Owner and Admin are assigned inside a workspace;
 * `user` is what a Google sign-up starts as.
 */
export const ROLE_LABELS = {
  admin: 'Administrator',
  user: 'Member',
};

export const ADMIN_ROLE = 'admin';
