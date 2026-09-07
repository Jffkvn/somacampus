#!/usr/bin/env node
/**
 * scripts/generate-demo-seed.mjs
 *
 * Generates a realistic, comprehensive, fully relational demo dataset
 * for Grace's Cambridge Centre (SomaCampus Demo Deployment):
 * - 1 Organisation & 1 School
 * - 1 Academic Year & 1 Term
 * - 10 Cambridge Classes (Stages 1 through 10) & 20 Streams
 * - 10 Subjects
 * - 20 Faculty & Staff (Principal, Bursar, Head of Academics, Storekeeper, Matron, 15 Teachers)
 * - 20 Employee Payroll Profiles & Leave Entitlements
 * - 10 Appointed Class/Form Teachers & Official Teaching Subjects
 * - 110 Students (11 per stage) with Enrolments, Guardians, Emergency Contacts & Medical Alerts
 * - Fee Structures
 * - 2 Stores, 5 Item Categories, Consumables, Assets & Active Custody records
 *
 * Output: scripts/seed-demo-school.sql
 * Validated by: node scripts/validate-seed.mjs scripts/seed-demo-school.sql
 */

import fs from 'node:fs';

function pad(num, size) {
  let s = String(num);
  while (s.length < size) s = '0' + s;
  return s;
}

// Fixed base UUID generators to guarantee unique, valid hex UUIDs:
// Group 1: prefix (8 hex)
// Group 2: table code (4 hex)
// Group 3: subtype (4 hex)
// Group 4: scope (4 hex)
// Group 5: sequence index (12 hex)
function makeUuid(prefix, tableCode, subCode, seq) {
  const p = pad(prefix.replace(/[^0-9a-f]/gi, ''), 8);
  const t = pad(tableCode.replace(/[^0-9a-f]/gi, ''), 4);
  const s = pad(subCode.replace(/[^0-9a-f]/gi, ''), 4);
  const seqStr = pad(seq.toString(16), 12);
  return `${p}-${t}-${s}-0000-${seqStr}`;
}

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const ACAD_YEAR_ID = '33333333-3333-3333-3333-333333333333';
const TERM_ID = '44444444-4444-4444-4444-444444444444';

const lines = [];
lines.push('-- ==============================================================================');
lines.push('-- SOMACAMPUS HIGH-VOLUME DEMO DATASET');
lines.push('-- Grace\'s Cambridge Centre (20 Teachers, 10 Classes, 110 Students, Inventory)');
lines.push('-- Section 5 of Locked Build Plan — Standalone Demo Dataset (never mixed with test seed)');
lines.push('-- ==============================================================================\n');

// 1. Organisation & School
lines.push(`INSERT INTO organisations (id, name, status) VALUES
  ('${ORG_ID}', 'Grace Educational Foundation', 'active')
ON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO schools (id, organisation_id, name, code, brand_color, country, timezone) VALUES
  ('${SCHOOL_ID}', '${ORG_ID}', 'Grace''s Cambridge Centre', 'GCC', '#002b36', 'UG', 'Africa/Kampala')
ON CONFLICT (code) DO NOTHING;\n`);

// 2. Roles
lines.push(`INSERT INTO roles (id, name, description) VALUES
  ('admin', 'Administrator', 'Full institutional and technical configuration'),
  ('principal', 'Principal / Director', 'Executive academic and operational oversight'),
  ('teacher', 'Teacher', 'Classroom instruction, attendance, and lesson records'),
  ('bursar', 'Finance / Bursar', 'Fee collection, payment reconciliation, and student accounts'),
  ('parent', 'Parent / Guardian', 'Family dashboard for children progress and fees'),
  ('student', 'Student', 'Learning materials, assignments, and diagnostic quizzes')
ON CONFLICT (id) DO NOTHING;\n`);

// 3. Academic Year & Term
lines.push(`INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_current) VALUES
  ('${ACAD_YEAR_ID}', '${SCHOOL_ID}', 'Academic Year 2026-2027', '2026-09-01', '2027-07-15', true)
ON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO terms (id, academic_year_id, name, term_number, start_date, end_date, is_current) VALUES
  ('${TERM_ID}', '${ACAD_YEAR_ID}', 'Term 1', 1, '2026-09-01', '2026-12-18', true)
ON CONFLICT (id) DO NOTHING;\n`);

// 4. Subjects (10 Cambridge Subjects)
const subjectDefs = [
  { code: 'MATH', name: 'Mathematics' },
  { code: 'ENG', name: 'English Language & Literature' },
  { code: 'SCI', name: 'General Science' },
  { code: 'PHY', name: 'Physics' },
  { code: 'CHEM', name: 'Chemistry' },
  { code: 'BIO', name: 'Biology' },
  { code: 'ICT', name: 'Information & Communication Tech' },
  { code: 'GEO', name: 'Geography & Environmental Studies' },
  { code: 'HIST', name: 'Global History' },
  { code: 'ART', name: 'Art & Design' },
];

const subjectIds = [];
const subjectInserts = subjectDefs.map((s, i) => {
  const id = makeUuid('a1', '7777', '0001', i + 1);
  subjectIds.push(id);
  return `  ('${id}', '${SCHOOL_ID}', '${s.name}', '${s.code}')`;
});
lines.push(`INSERT INTO subjects (id, school_id, name, code) VALUES\n${subjectInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

// 5. Classes & Streams (10 Stages: Stage 1 through Stage 10)
const classIds = [];
const streamIds = [];
const classInserts = [];
const streamInserts = [];

for (let i = 1; i <= 10; i++) {
  const cId = makeUuid('c1', '5555', '0001', i);
  classIds.push(cId);
  const stageName = `Stage ${i}`;
  classInserts.push(`  ('${cId}', '${SCHOOL_ID}', '${stageName}', '${stageName}')`);

  // 2 streams per class: Blue and Gold
  const sBlue = makeUuid('d1', '6666', '0001', (i * 2) - 1);
  const sGold = makeUuid('d1', '6666', '0001', i * 2);
  streamIds.push(sBlue, sGold);
  streamInserts.push(`  ('${sBlue}', '${cId}', 'Blue', 'Room ${i}A')`);
  streamInserts.push(`  ('${sGold}', '${cId}', 'Gold', 'Room ${i}B')`);
}
lines.push(`INSERT INTO classes (id, school_id, name, stage_level) VALUES\n${classInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
lines.push(`INSERT INTO streams (id, class_id, name, default_room) VALUES\n${streamInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

// 6. Faculty & Staff: Exactly 20 staff members
const staffDefs = [
  { first: 'Florence', last: 'Namugga', role: 'principal', dept: 'Executive', empNo: 'EMP-001', salary: 6500000, qual: 'Ph.D in Educational Leadership', isTeacher: true, subIdx: [0, 1] },
  { first: 'David', last: 'Musoke', role: 'teacher', dept: 'Academics', empNo: 'EMP-002', salary: 4500000, qual: 'M.Sc Mathematics Education', isTeacher: true, subIdx: [0] },
  { first: 'Sarah', last: 'Nabwire', role: 'bursar', dept: 'Finance', empNo: 'EMP-003', salary: 4200000, qual: 'CPA / B.Com Finance', isTeacher: false, subIdx: [] },
  { first: 'Peter', last: 'Okello', role: 'admin', dept: 'Operations & Store', empNo: 'EMP-004', salary: 3200000, qual: 'Diploma in Procurement & Logistics', isTeacher: false, subIdx: [] },
  { first: 'Grace', last: 'Akello', role: 'admin', dept: 'Welfare & Health', empNo: 'EMP-005', salary: 3000000, qual: 'Registered Nurse / Health Diploma', isTeacher: false, subIdx: [] },
  { first: 'James', last: 'Kato', role: 'teacher', dept: 'Science', empNo: 'EMP-006', salary: 3800000, qual: 'B.Sc with Education (Physics/Chem)', isTeacher: true, subIdx: [3, 4] },
  { first: 'Mary', last: 'Nabatanzi', role: 'teacher', dept: 'Languages', empNo: 'EMP-007', salary: 3600000, qual: 'B.A Education (English/Lit)', isTeacher: true, subIdx: [1] },
  { first: 'Paul', last: 'Mukasa', role: 'teacher', dept: 'Science', empNo: 'EMP-008', salary: 3700000, qual: 'B.Sc with Education (Biology)', isTeacher: true, subIdx: [2, 5] },
  { first: 'Esther', last: 'Birungi', role: 'teacher', dept: 'Primary', empNo: 'EMP-009', salary: 3400000, qual: 'Bachelor of Primary Education', isTeacher: true, subIdx: [0, 1] },
  { first: 'Moses', last: 'Ssemwogerere', role: 'teacher', dept: 'Humanities', empNo: 'EMP-010', salary: 3500000, qual: 'B.A Education (History/Geo)', isTeacher: true, subIdx: [7, 8] },
  { first: 'Rebecca', last: 'Nantongo', role: 'teacher', dept: 'ICT', empNo: 'EMP-011', salary: 3800000, qual: 'B.Sc Computer Science & Education', isTeacher: true, subIdx: [6] },
  { first: 'Charles', last: 'Ochieng', role: 'teacher', dept: 'Creative Arts', empNo: 'EMP-012', salary: 3300000, qual: 'B.A Fine Art & Design', isTeacher: true, subIdx: [9] },
  { first: 'Agnes', last: 'Kyomugisha', role: 'teacher', dept: 'Primary', empNo: 'EMP-013', salary: 3400000, qual: 'Diploma in Early Childhood & Primary', isTeacher: true, subIdx: [0, 2] },
  { first: 'Daniel', last: 'Wasswa', role: 'teacher', dept: 'Science', empNo: 'EMP-014', salary: 3600000, qual: 'B.Sc Education (Chemistry)', isTeacher: true, subIdx: [4] },
  { first: 'Juliet', last: 'Nakabugo', role: 'teacher', dept: 'Languages', empNo: 'EMP-015', salary: 3500000, qual: 'B.A Linguistics & Literature', isTeacher: true, subIdx: [1] },
  { first: 'Samuel', last: 'Batte', role: 'teacher', dept: 'Mathematics', empNo: 'EMP-016', salary: 3700000, qual: 'B.Sc Mathematics & Statistics', isTeacher: true, subIdx: [0] },
  { first: 'Catherine', last: 'Nalubega', role: 'teacher', dept: 'Humanities', empNo: 'EMP-017', salary: 3400000, qual: 'B.Ed Geography & Economics', isTeacher: true, subIdx: [7] },
  { first: 'Francis', last: 'Kibuuka', role: 'teacher', dept: 'Primary', empNo: 'EMP-018', salary: 3300000, qual: 'Grade III / Primary Education Diploma', isTeacher: true, subIdx: [0, 1] },
  { first: 'Irene', last: 'Ainembabazi', role: 'teacher', dept: 'Science', empNo: 'EMP-019', salary: 3500000, qual: 'B.Sc Education (Physics)', isTeacher: true, subIdx: [3] },
  { first: 'Arthur', last: 'Mugisha', role: 'teacher', dept: 'ICT', empNo: 'EMP-020', salary: 3600000, qual: 'B.IT / Certified Cambridge Teacher', isTeacher: true, subIdx: [6] },
];

const staffPeopleIds = [];
const staffEmployeeIds = [];
const staffPeopleInserts = [];
const staffEmployeeInserts = [];
const payrollInserts = [];
const subjectApptInserts = [];
const classTeacherInserts = [];

staffDefs.forEach((s, i) => {
  const pId = makeUuid('e1', '8888', '0001', i + 1);
  const eId = makeUuid('f1', '9999', '0001', i + 1);
  staffPeopleIds.push(pId);
  staffEmployeeIds.push(eId);

  const email = `${s.first.toLowerCase()}.${s.last.toLowerCase()}@graceschool.ac.ug`;
  const phone = `+25677${pad(i + 10, 2)}12345`;
  const dob = `198${(i % 10)}-05-${pad((i % 28) + 1, 2)}`;
  const gender = i % 2 === 0 ? 'female' : 'male';
  const natId = `CM98${pad(i + 1, 6)}11UG`;

  staffPeopleInserts.push(
    `  ('${pId}', '${s.first}', '${s.last}', '${email}', '${phone}', '${dob}', '${gender}', '${natId}', 'Ugandan', 'Kampala, Uganda')`
  );

  staffEmployeeInserts.push(
    `  ('${eId}', '${pId}', '${SCHOOL_ID}', '${s.empNo}', '${s.role}', '${s.dept}', ${s.isTeacher}, 'active', '2024-01-15', 'permanent', '${s.qual}')`
  );

  // Payroll profile
  const payId = makeUuid('b1', 'bbbb', '0001', i + 1);
  payrollInserts.push(
    `  ('${payId}', '${SCHOOL_ID}', '${eId}', '2024-01-15', ${s.salary}, 'UGX', 'salaried', 'bank_transfer', 'Stanbic Bank Uganda', '90300${pad(i + 1, 7)}', '${s.first} ${s.last}', true)`
  );

  // Appoint official subjects
  s.subIdx.forEach((sIdx, subK) => {
    const apptId = makeUuid('a2', 'aaaa', '0001', (i * 10) + subK + 1);
    subjectApptInserts.push(
      `  ('${apptId}', '${SCHOOL_ID}', '${eId}', '${subjectIds[sIdx]}', 'Appointed faculty instructor')`
    );
  });

  // Assign class teachers for first 10 classes
  if (i >= 5 && i < 15) {
    const classIdx = i - 5; // 0 to 9
    const ctId = makeUuid('c2', 'cccc', '0001', classIdx + 1);
    classTeacherInserts.push(
      `  ('${ctId}', '${classIds[classIdx]}', '${eId}', '${ACAD_YEAR_ID}', true)`
    );
  }
});

lines.push(`INSERT INTO people (id, first_name, last_name, email, phone, date_of_birth, gender, national_id, nationality, address) VALUES\n${staffPeopleInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO employees (id, person_id, school_id, employee_number, role, department, is_teacher, status, hire_date, contract_type, qualification) VALUES\n${staffEmployeeInserts.join(',\n')}\nON CONFLICT (school_id, employee_number) DO NOTHING;\n`);

lines.push(`INSERT INTO employee_payroll_profiles (id, school_id, employee_id, effective_from, base_salary, currency, pay_basis, payment_method, bank_name, bank_account_number, bank_account_name, nssf_applicable) VALUES\n${payrollInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO teacher_official_subjects (id, school_id, teacher_id, subject_id, notes) VALUES\n${subjectApptInserts.join(',\n')}\nON CONFLICT (teacher_id, subject_id) DO NOTHING;\n`);

lines.push(`INSERT INTO class_teachers (id, class_id, teacher_id, academic_year_id, is_active) VALUES\n${classTeacherInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

// 7. Leave Types & Entitlements
const leaveTypeIds = [
  makeUuid('12', '1eee', '0001', 1),
  makeUuid('12', '1eee', '0001', 2),
  makeUuid('12', '1eee', '0001', 3),
];
lines.push(`INSERT INTO leave_types (id, school_id, code, name, is_paid, default_entitlement_days, requires_evidence, color, display_order) VALUES
  ('${leaveTypeIds[0]}', '${SCHOOL_ID}', 'annual', 'Annual Leave', true, 21, false, '#059669', 1),
  ('${leaveTypeIds[1]}', '${SCHOOL_ID}', 'sick', 'Sick Leave', true, 30, true, '#dc2626', 2),
  ('${leaveTypeIds[2]}', '${SCHOOL_ID}', 'compassionate', 'Compassionate Leave', true, 5, false, '#d97706', 3)
ON CONFLICT (school_id, code) DO NOTHING;\n`);

const leaveEntitlements = [];
staffEmployeeIds.forEach((eId, idx) => {
  const ent1 = makeUuid('1e', '2eee', '0001', (idx * 3) + 1);
  const ent2 = makeUuid('1e', '2eee', '0001', (idx * 3) + 2);
  leaveEntitlements.push(`  ('${ent1}', '${SCHOOL_ID}', '${eId}', '${leaveTypeIds[0]}', 2026, 21.0)`);
  leaveEntitlements.push(`  ('${ent2}', '${SCHOOL_ID}', '${eId}', '${leaveTypeIds[1]}', 2026, 30.0)`);
});
lines.push(`INSERT INTO leave_entitlements (id, school_id, employee_id, leave_type_id, leave_year, entitled_days) VALUES\n${leaveEntitlements.join(',\n')}\nON CONFLICT (employee_id, leave_type_id, leave_year) DO NOTHING;\n`);

// 8. 110 Students across 10 classes (11 per class)
const firstNames = [
  'Liam', 'Maya', 'Ethan', 'Chloe', 'Noah', 'Zoe', 'Lucas', 'Mia', 'Aiden', 'Ava',
  'Kato', 'Babirye', 'Mugisha', 'Nalubega', 'Otim', 'Kiconco', 'Tendo', 'Sanyu', 'Mukisa', 'Kirabo',
  'Alexander', 'Sophia', 'Benjamin', 'Isabella', 'William', 'Amara', 'Tariq', 'Fatima', 'Jabari', 'Amina'
];
const lastNames = [
  'Namutebi', 'Mukasa', 'Ssenyonjo', 'Kigozi', 'Mbabazi', 'Kavuma', 'Bukenya', 'Kwesiga', 'Akello', 'Ochieng',
  'Johnson', 'Smith', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez',
  'Mugabe', 'Tumusiime', 'Byaruhanga', 'Nsubuga', 'Kisekka', 'Lwanga', 'Kyeyune', 'Nabakooza', 'Mukiibi', 'Sekandi'
];
const allergiesList = [
  'Severe Peanut Allergy (EpiPen in sickbay)',
  'Penicillin Allergy',
  'Lactose Intolerance',
  'Asthma / Dust Sensitivity',
  'Egg Protein Allergy',
  'None Known',
  'None Known',
  'None Known',
  'None Known',
  'Seafood / Shellfish Allergy',
  'Bee Sting Hypersensitivity',
];

const studentPeopleInserts = [];
const studentsInserts = [];
const enrolmentInserts = [];
const medicalInserts = [];
const emergContactInserts = [];

let studentCounter = 0;

for (let cIdx = 0; cIdx < 10; cIdx++) {
  const cId = classIds[cIdx];
  const stageNum = cIdx + 1;
  const sBlue = streamIds[cIdx * 2];
  const sGold = streamIds[(cIdx * 2) + 1];

  for (let sInClass = 0; sInClass < 11; sInClass++) {
    studentCounter++;
    const idx = studentCounter;
    const pId = makeUuid('91', '1000', '0001', idx);
    const stuId = makeUuid('92', '2000', '0001', idx);
    const enrId = makeUuid('93', '3000', '0001', idx);
    const medId = makeUuid('94', '4000', '0001', idx);
    const emgId = makeUuid('95', '5000', '0001', idx);

    const fName = firstNames[(idx + (cIdx * 3)) % firstNames.length];
    const lName = lastNames[(idx * 7) % lastNames.length];
    const gender = idx % 2 === 0 ? 'female' : 'male';
    const birthYear = 2026 - (stageNum + 4); // Stage 1 is ~5-6yo (2020), Stage 10 is ~14-15yo (2011)
    const dob = `${birthYear}-${pad((idx % 12) + 1, 2)}-${pad((idx % 27) + 1, 2)}`;
    const admNo = `GCC-2026-${pad(idx, 3)}`;

    studentPeopleInserts.push(
      `  ('${pId}', '${fName}', '${lName}', null, null, '${dob}', '${gender}', null, 'Ugandan', 'Kampala')`
    );

    studentsInserts.push(
      `  ('${stuId}', '${pId}', '${admNo}', '${dob}', '${gender}')`
    );

    const chosenStream = sInClass % 2 === 0 ? sBlue : sGold;
    enrolmentInserts.push(
      `  ('${enrId}', '${stuId}', '${cId}', '${chosenStream}', 'enrolled', '2026-09-01')`
    );

    const allergy = allergiesList[idx % allergiesList.length];
    const condition = allergy.includes('Asthma') ? 'Asthma' : (idx % 15 === 0 ? 'Mild Eczema' : 'None');
    medicalInserts.push(
      `  ('${medId}', '${stuId}', '${allergy}', '${condition}', null, 'O+', null, 'Emergency medication verified on file')`
    );

    const parentName = `${lastNames[(idx * 3) % lastNames.length]} Parent`;
    emergContactInserts.push(
      `  ('${emgId}', '${stuId}', '${parentName}', 'Parent/Guardian', '+256782${pad(idx, 6)}', 1)`
    );
  }
}

lines.push(`INSERT INTO people (id, first_name, last_name, email, phone, date_of_birth, gender, national_id, nationality, address) VALUES\n${studentPeopleInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO students (id, person_id, admission_number, date_of_birth, gender) VALUES\n${studentsInserts.join(',\n')}\nON CONFLICT (admission_number) DO NOTHING;\n`);

lines.push(`INSERT INTO student_enrolments (id, student_id, class_id, stream_id, status, enrolled_at) VALUES\n${enrolmentInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO student_medical (id, student_id, allergies, conditions, medication, blood_group, restrictions, notes) VALUES\n${medicalInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO student_emergency_contacts (id, student_id, name, relationship, phone, priority) VALUES\n${emergContactInserts.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);

// 9. School Inventory & Assets (Slice 3)
const store1 = makeUuid('31', '3000', '0001', 1);
const store2 = makeUuid('31', '3000', '0001', 2);
lines.push(`INSERT INTO stores (id, school_id, name, code, description, is_active) VALUES
  ('${store1}', '${SCHOOL_ID}', 'Main Campus Central Store', 'MAIN-STORE', 'Central repository for educational materials and office consumables', true),
  ('${store2}', '${SCHOOL_ID}', 'Science & STEM Laboratory Store', 'SCI-STORE', 'Apparatus, chemicals, glassware, and robotics kits', true)
ON CONFLICT (school_id, code) DO NOTHING;\n`);

const catIds = [
  makeUuid('32', '3000', '0001', 1),
  makeUuid('32', '3000', '0001', 2),
  makeUuid('32', '3000', '0001', 3),
  makeUuid('32', '3000', '0001', 4),
  makeUuid('32', '3000', '0001', 5),
];
lines.push(`INSERT INTO item_categories (id, school_id, name, description, is_active) VALUES
  ('${catIds[0]}', '${SCHOOL_ID}', 'Stationery & Writing', 'Whiteboard markers, pens, reams of paper, notebooks', true),
  ('${catIds[1]}', '${SCHOOL_ID}', 'Science Lab Apparatus', 'Glassware, beakers, test tubes, reagents', true),
  ('${catIds[2]}', '${SCHOOL_ID}', 'IT & Electronics', 'Staff laptops, projectors, HDMI cables, monitors', true),
  ('${catIds[3]}', '${SCHOOL_ID}', 'Textbooks & Readers', 'Cambridge primary and secondary coursebooks', true),
  ('${catIds[4]}', '${SCHOOL_ID}', 'Sports & Athletics', 'Footballs, bibs, whistles, cones, track gear', true)
ON CONFLICT (id) DO NOTHING;\n`);

const consumableIds = [
  makeUuid('33', '3000', '0001', 1),
  makeUuid('33', '3000', '0001', 2),
  makeUuid('33', '3000', '0001', 3),
  makeUuid('33', '3000', '0001', 4),
];
lines.push(`INSERT INTO consumables (id, store_id, category_id, sku, name, unit_of_measure, reorder_level, current_balance, is_active) VALUES
  ('${consumableIds[0]}', '${store1}', '${catIds[0]}', 'SKU-MRK-BLK', 'Dry-Erase Whiteboard Markers (Bullet Black)', 'box_12', 10, 48, true),
  ('${consumableIds[1]}', '${store1}', '${catIds[0]}', 'SKU-PPR-A4', 'Rotatrim A4 Copy Paper 80gsm', 'ream', 20, 150, true),
  ('${consumableIds[2]}', '${store1}', '${catIds[0]}', 'SKU-NBK-96', 'Ruled Exercise Books (96 Pages)', 'pack_10', 15, 80, true),
  ('${consumableIds[3]}', '${store2}', '${catIds[1]}', 'SKU-TUB-15', 'Borosilicate Test Tubes (15ml)', 'box_24', 5, 24, true)
ON CONFLICT (id) DO NOTHING;\n`);

// Equipment Assets & Custody Tracking
const assetIds = [
  makeUuid('34', '3000', '0001', 1),
  makeUuid('34', '3000', '0001', 2),
  makeUuid('34', '3000', '0001', 3),
  makeUuid('34', '3000', '0001', 4),
];
lines.push(`INSERT INTO equipment_assets (id, store_id, category_id, asset_tag, name, serial_number, status, condition_status) VALUES
  ('${assetIds[0]}', '${store1}', '${catIds[2]}', 'GCC-LAP-001', 'Dell Latitude 5420 Core i5 Laptop', 'SN-DELL-98213', 'in_use', 'good'),
  ('${assetIds[1]}', '${store1}', '${catIds[2]}', 'GCC-LAP-002', 'Dell Latitude 5420 Core i5 Laptop', 'SN-DELL-98214', 'in_use', 'good'),
  ('${assetIds[2]}', '${store1}', '${catIds[2]}', 'GCC-PRJ-001', 'Epson EB-E01 3LCD XGA Projector', 'SN-EPS-44211', 'in_use', 'excellent'),
  ('${assetIds[3]}', '${store2}', '${catIds[1]}', 'GCC-MIC-001', 'Olympus CX23 Binocular Microscope', 'SN-OLY-10022', 'in_store', 'good')
ON CONFLICT (id) DO NOTHING;\n`);

// Asset Custody assignments: Florence (emp 1), David (emp 2), James (emp 6)
const custodyIds = [
  makeUuid('35', '3000', '0001', 1),
  makeUuid('35', '3000', '0001', 2),
  makeUuid('35', '3000', '0001', 3),
];
lines.push(`INSERT INTO asset_custody (id, asset_id, employee_id, issued_at, condition_on_issue, is_active, notes) VALUES
  ('${custodyIds[0]}', '${assetIds[0]}', '${staffEmployeeIds[0]}', '2024-02-01', 'good', true, 'Issued to Executive Principal for institutional governance'),
  ('${custodyIds[1]}', '${assetIds[1]}', '${staffEmployeeIds[1]}', '2024-02-01', 'good', true, 'Assigned to Head of Academics for timetable planning'),
  ('${custodyIds[2]}', '${assetIds[2]}', '${staffEmployeeIds[5]}', '2024-02-15', 'excellent', true, 'Science department multimedia projector')
ON CONFLICT (id) DO NOTHING;\n`);

// 10. Material Requests (e.g. Florence markers request acceptance scenario)
const req1 = makeUuid('36', '3000', '0001', 1);
const reqLine1 = makeUuid('37', '3000', '0001', 1);
lines.push(`INSERT INTO stock_requests (id, store_id, requested_by, request_number, status, purpose, required_by_date) VALUES
  ('${req1}', '${store1}', '${staffEmployeeIds[0]}', 'REQ-2026-001', 'fulfilled', 'Term 1 classroom instruction markers', '2026-09-02')
ON CONFLICT (id) DO NOTHING;\n`);

lines.push(`INSERT INTO stock_request_lines (id, request_id, consumable_id, quantity_requested, quantity_approved, quantity_issued) VALUES
  ('${reqLine1}', '${req1}', '${consumableIds[0]}', 4, 4, 4)
ON CONFLICT (id) DO NOTHING;\n`);

const outputPath = 'scripts/seed-demo-school.sql';
fs.writeFileSync(outputPath, lines.join(''), 'utf8');
console.log(`Demo seed generated successfully at ${outputPath} (${lines.length} sections, 20 teachers, 10 classes, 110 students).`);
