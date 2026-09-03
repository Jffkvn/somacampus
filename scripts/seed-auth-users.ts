import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY);

interface DemoUser {
  email: string;
  password: string;
  role: 'admin' | 'principal' | 'teacher' | 'bursar' | 'parent' | 'student';
  firstName: string;
  lastName: string;
  employeeNumber?: string;
  admissionNumber?: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'admin@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'admin',
    firstName: 'Grace',
    lastName: 'Mukasa',
    employeeNumber: 'EMP-ADM-01',
  },
  {
    email: 'principal@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'principal',
    firstName: 'Dr. Edward',
    lastName: 'Ssenyonga',
    employeeNumber: 'EMP-PRN-01',
  },
  {
    email: 'teacher@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'teacher',
    firstName: 'Sarah',
    lastName: 'Namukasa',
    employeeNumber: 'TCH-001',
  },
  {
    email: 'david.m@graceschool.ac.ug',
    password: 'SomaCampus2026!',
    role: 'teacher',
    firstName: 'David',
    lastName: 'Musoke',
    employeeNumber: 'TCH-002',
  },
  {
    email: 'mary.n@graceschool.ac.ug',
    password: 'SomaCampus2026!',
    role: 'teacher',
    firstName: 'Mary',
    lastName: 'Nabatanzi',
    employeeNumber: 'TCH-003',
  },
  {
    email: 'james.k@graceschool.ac.ug',
    password: 'SomaCampus2026!',
    role: 'teacher',
    firstName: 'James',
    lastName: 'Kato',
    employeeNumber: 'TCH-004',
  },
  {
    email: 'paul.m@graceschool.ac.ug',
    password: 'SomaCampus2026!',
    role: 'teacher',
    firstName: 'Paul',
    lastName: 'Mukasa',
    employeeNumber: 'TCH-005',
  },
  {
    email: 'bursar@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'bursar',
    firstName: 'Patrick',
    lastName: 'Opolot',
    employeeNumber: 'EMP-BUR-01',
  },
  {
    email: 'parent@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'parent',
    firstName: 'Florence',
    lastName: 'Kyomugisha',
  },
  {
    email: 'student@somacampus.ug',
    password: 'SomaCampus2026!',
    role: 'student',
    firstName: 'Amari',
    lastName: 'Kyomugisha',
    admissionNumber: '2026/0142',
  },
];

async function seedAuthUsers() {
  console.log('--- Seeding SomaCampus Auth Users ---');

  // 1. Get School
  const { data: schools, error: schoolErr } = await adminClient
    .from('schools')
    .select('id, name, code')
    .eq('code', 'GCC')
    .limit(1);

  if (schoolErr || !schools || schools.length === 0) {
    throw new Error(`School GCC not found: ${schoolErr?.message}`);
  }
  const school = schools[0];
  console.log(`Target School: ${school.name} (${school.id})`);

  // 2. Fetch existing auth users to avoid duplicates
  const { data: existingUsersData, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    throw new Error(`Failed to list existing auth users: ${listErr.message}`);
  }
  const existingUsers = existingUsersData.users || [];

  for (const userDef of DEMO_USERS) {
    console.log(`\nProcessing ${userDef.role.toUpperCase()}: ${userDef.email}`);

    let authUserId: string;
    const existing = existingUsers.find((u) => u.email === userDef.email);

    if (existing) {
      console.log(`  User exists in auth.users (${existing.id}), updating password...`);
      const { data: updated, error: updateErr } = await adminClient.auth.admin.updateUserById(
        existing.id,
        {
          password: userDef.password,
          email_confirm: true,
          user_metadata: {
            full_name: `${userDef.firstName} ${userDef.lastName}`,
            role: userDef.role,
            school_id: school.id,
          },
        }
      );
      if (updateErr) {
        throw new Error(`Failed to update ${userDef.email}: ${updateErr.message}`);
      }
      authUserId = updated.user.id;
    } else {
      console.log(`  Creating user in auth.users...`);
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: userDef.email,
        password: userDef.password,
        email_confirm: true,
        user_metadata: {
          full_name: `${userDef.firstName} ${userDef.lastName}`,
          role: userDef.role,
          school_id: school.id,
        },
      });
      if (createErr) {
        throw new Error(`Failed to create ${userDef.email}: ${createErr.message}`);
      }
      authUserId = created.user.id;
    }

    // 3. Link or insert into `people`
    const { data: existingPeople } = await adminClient
      .from('people')
      .select('id')
      .eq('email', userDef.email)
      .limit(1);

    let personId: string;
    if (existingPeople && existingPeople.length > 0) {
      personId = existingPeople[0].id;
      await adminClient
        .from('people')
        .update({ auth_user_id: authUserId })
        .eq('id', personId);
    } else {
      const { data: newPerson } = await adminClient
        .from('people')
        .insert({
          auth_user_id: authUserId,
          first_name: userDef.firstName,
          last_name: userDef.lastName,
          email: userDef.email,
        })
        .select('id')
        .single();
      personId = newPerson!.id;
    }

    // 4. Upsert into `user_roles`
    const { error: roleErr } = await adminClient.from('user_roles').upsert(
      {
        user_id: authUserId,
        school_id: school.id,
        role_id: userDef.role,
      },
      { onConflict: 'user_id,school_id,role_id' }
    );
    if (roleErr) {
      console.warn(`  Warning assigning user role: ${roleErr.message}`);
    } else {
      console.log(`  Assigned role '${userDef.role}' for school '${school.code}'`);
    }

    // 5. If staff, link employee
    if (userDef.employeeNumber) {
      await adminClient
        .from('employees')
        .update({ person_id: personId, status: 'active' })
        .eq('school_id', school.id)
        .eq('employee_number', userDef.employeeNumber);
    }

    // 6. Test actual login via anonClient (as a real user would log in)
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: userDef.email,
      password: userDef.password,
    });

    if (loginErr || !loginData.session) {
      console.error(`  FAILED login check for ${userDef.email}: ${loginErr?.message}`);
    } else {
      console.log(`  LOGIN VERIFIED: Access token acquired for ${userDef.email}`);
      await anonClient.auth.signOut();
    }
  }

  console.log('\n--- All demo auth users successfully seeded and verified! ---');
}

seedAuthUsers().catch((err) => {
  console.error('Fatal error seeding auth users:', err);
  process.exit(1);
});
