const http = require('node:http');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { CoreSchoolStore } = require('./modules/core-school');
const { StudentStore, buildValidationError } = require('./modules/student');
const { ParentStore } = require('./modules/parent');
const { TeacherStore } = require('./modules/teacher');

const users = [
  { id: 'admin-a', email: 'admin@school-a.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'admin-b', email: 'admin@school-b.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-b' },
  { id: 'director-a', email: 'director@school-a.test', password: 'password123', role: ROLES.DIRECTOR, tenantId: 'school-a' }
];

function createSeedData() {
  return {
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 32 },
      { id: 'class-a2', tenant_id: 'school-a', name: 'A2', gradeLevelId: 'grade-a-1', capacity: 30 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
    ],
    subjects: [
      { id: 'subject-a-math', tenant_id: 'school-a', name: 'Mathématiques', code: 'MATH' },
      { id: 'subject-a-fr', tenant_id: 'school-a', name: 'Français', code: 'FR' },
      { id: 'subject-b-math', tenant_id: 'school-b', name: 'Mathématiques', code: 'MATH' }
    ],
    students: [
      {
        id: 'student-a1',
        tenant_id: 'school-a',
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-001',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-03-09',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'student-b1',
        tenant_id: 'school-b',
        firstName: 'Bilal',
        lastName: 'Haddad',
        admissionNumber: 'B-001',
        classRoomId: 'class-b1',
        dateOfBirth: '2012-12-01',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    parents: [],
    studentParentLinks: [],
    teachers: []
  };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const [name, ...rawValue] = entry.split('=');
      cookies[name] = decodeURIComponent(rawValue.join('='));
      return cookies;
    }, {});
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

async function parseJsonBody(request) {
  const rawBody = await readBody(request);
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw buildValidationError('Request body must be valid JSON');
  }
}

function parseForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    email: searchParams.get('email') ?? '',
    password: searchParams.get('password') ?? ''
  };
}

function parseExtendedForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    get(name) {
      return searchParams.get(name) ?? '';
    },
    getAll(name) {
      return searchParams.getAll(name);
    }
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendApiSuccess(response, data, statusCode = 200) {
  sendJson(response, statusCode, {
    data,
    meta: { request_id: crypto.randomUUID() }
  });
}

const crypto = require('node:crypto');

function sendApiError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: { code, message },
    meta: { request_id: crypto.randomUUID() }
  });
}

function canManageStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canViewStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.DIRECTOR;
}

function canManageParents(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canManageTeachers(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function renderLoginPage(errorMessage = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>EducLink - Login</title></head><body>
    <h1>Connexion EducLink</h1>
    ${errorMessage ? `<p style="color:red">${errorMessage}</p>` : ''}
    <form method="POST" action="/login">
      <label>Email <input type="email" name="email" required /></label><br/>
      <label>Mot de passe <input type="password" name="password" required /></label><br/>
      <button type="submit">Se connecter</button>
    </form>
  </body></html>`;
}

function renderDashboard(session) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Dashboard</title></head><body>
    <h1>Dashboard</h1>
    <p>role: ${session.role}</p>
    <p>tenantId: ${session.tenantId}</p>
    <p><a href="/admin/students">Gérer les élèves</a></p>
    <p><a href="/admin/parents">Gérer les responsables</a></p>
    <p><a href="/admin/teachers">Gérer les enseignants</a></p>
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body></html>`;
}

function renderStudentsPage(session, classRooms, students, selectedClassRoomId = '') {
  const options = ['<option value="">Toutes les classes</option>']
    .concat(classRooms.map((classRoom) => `<option value="${classRoom.id}" ${selectedClassRoomId === classRoom.id ? 'selected' : ''}>${classRoom.name}</option>`))
    .join('');

  const rows = students
    .map(
      (student) => `<tr>
        <td><a href="/admin/students/${student.id}">${student.firstName} ${student.lastName}</a></td>
        <td>${student.admissionNumber}</td>
        <td>${student.classRoomId}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Students</title></head><body>
    <h1>Gestion des élèves</h1>
    <p>Tenant: ${session.tenantId}</p>
    <form method="GET" action="/admin/students">
      <label>Filtre classe
        <select name="classRoomId">${options}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table border="1"><thead><tr><th>Nom</th><th>Matricule</th><th>Classe</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

function renderStudentProfile(student) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Student profile</title></head><body>
    <h1>Fiche élève</h1>
    <p>id: ${student.id}</p>
    <p>Nom: ${student.firstName} ${student.lastName}</p>
    <p>Matricule: ${student.admissionNumber}</p>
    <p>Classe: ${student.classRoomId}</p>
    <p>Date de naissance: ${student.dateOfBirth || '-'}</p>
    <p>Archivé: ${student.archived_at ? 'oui' : 'non'}</p>
    <p><a href="/admin/students">Retour</a></p>
  </body></html>`;
}

function renderParentsPage(session, parents) {
  const rows = parents
    .map(
      (parent) => `<tr>
        <td><a href="/admin/parents/${parent.id}">${parent.firstName} ${parent.lastName}</a></td>
        <td>${parent.phone || '-'}</td>
        <td>${parent.email || '-'}</td>
        <td>${parent.archived_at ? 'oui' : 'non'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parents</title></head><body>
    <h1>Gestion des responsables</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Créer un responsable</h2>
    <form method="POST" action="/admin/parents">
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Email <input name="email" type="email" /></label><br/>
      <label>Adresse <input name="address" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    <h2>Liste</h2>
    <table border="1"><thead><tr><th>Nom</th><th>Téléphone</th><th>Email</th><th>Archivé</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderParentProfile(parent, students, links) {
  const studentCheckboxes = students
    .map((student) => `<label><input type="checkbox" name="studentIds" value="${student.id}" /> ${student.firstName} ${student.lastName} (${student.classRoomId})</label><br/>`)
    .join('');
  const linkRows = links
    .map((link) => `<tr><td>${link.student?.firstName ?? '-'} ${link.student?.lastName ?? ''}</td><td>${link.relationship}</td><td>${link.isPrimaryContact ? 'oui' : 'non'}</td></tr>`)
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Parent profile</title></head><body>
    <h1>Fiche responsable</h1>
    <p>id: ${parent.id}</p>
    <p>Tenant: ${parent.tenant_id}</p>
    <h2>Informations</h2>
    <form method="POST" action="/admin/parents/${parent.id}/update">
      <label>Prénom <input name="firstName" value="${parent.firstName}" required /></label><br/>
      <label>Nom <input name="lastName" value="${parent.lastName}" required /></label><br/>
      <label>Téléphone <input name="phone" value="${parent.phone}" /></label><br/>
      <label>Email <input name="email" type="email" value="${parent.email}" /></label><br/>
      <label>Adresse <input name="address" value="${parent.address}" /></label><br/>
      <label>Notes <textarea name="notes">${parent.notes}</textarea></label><br/>
      <button type="submit">Enregistrer</button>
    </form>
    <form method="POST" action="/admin/parents/${parent.id}/archive"><button type="submit">Archiver</button></form>
    <h2>Lier à des élèves</h2>
    <form method="POST" action="/admin/parents/${parent.id}/links">
      ${studentCheckboxes}
      <label>Relation
        <select name="relationship">
          <option value="guardian">Responsable</option>
          <option value="mother">Mère</option>
          <option value="father">Père</option>
          <option value="other">Autre</option>
        </select>
      </label><br/>
      <label>Contact principal <input type="checkbox" name="isPrimaryContact" value="true" /></label><br/>
      <button type="submit">Lier</button>
    </form>
    <h2>Liens existants</h2>
    <table border="1"><thead><tr><th>Élève</th><th>Relation</th><th>Principal</th></tr></thead><tbody>${linkRows}</tbody></table>
    <p><a href="/admin/parents">Retour</a></p>
  </body></html>`;
}

function renderTeachersPage(session, teachers) {
  const rows = teachers
    .map(
      (teacher) => `<tr>
        <td><a href="/admin/teachers/${teacher.id}">${teacher.firstName} ${teacher.lastName}</a></td>
        <td>${teacher.email || '-'}</td>
        <td>${teacher.classRoomIds.length}</td>
        <td>${teacher.subjectIds.length}</td>
        <td>${teacher.archived_at ? 'oui' : 'non'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teachers</title></head><body>
    <h1>Gestion des enseignants</h1>
    <p>Tenant: ${session.tenantId}</p>
    <h2>Créer un enseignant</h2>
    <form method="POST" action="/admin/teachers">
      <label>Prénom <input name="firstName" required /></label><br/>
      <label>Nom <input name="lastName" required /></label><br/>
      <label>Email <input name="email" type="email" /></label><br/>
      <label>Téléphone <input name="phone" /></label><br/>
      <label>Notes <textarea name="notes"></textarea></label><br/>
      <button type="submit">Créer</button>
    </form>
    <h2>Liste</h2>
    <table border="1"><thead><tr><th>Nom</th><th>Email</th><th># Classes</th><th># Matières</th><th>Archivé</th></tr></thead><tbody>${rows}</tbody></table>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body></html>`;
}

function renderTeacherProfile(teacher, classRooms, subjects) {
  const classRoomCheckboxes = classRooms
    .map(
      (classRoom) =>
        `<label><input type="checkbox" name="classRoomIds" value="${classRoom.id}" ${teacher.classRoomIds.includes(classRoom.id) ? 'checked' : ''} /> ${classRoom.name}</label><br/>`
    )
    .join('');
  const subjectCheckboxes = subjects
    .map(
      (subject) =>
        `<label><input type="checkbox" name="subjectIds" value="${subject.id}" ${teacher.subjectIds.includes(subject.id) ? 'checked' : ''} /> ${subject.name}</label><br/>`
    )
    .join('');
  const classNames = teacher.classRoomIds.map((classRoomId) => classRooms.find((item) => item.id === classRoomId)?.name || classRoomId).join(', ') || '-';
  const subjectNames = teacher.subjectIds.map((subjectId) => subjects.find((item) => item.id === subjectId)?.name || subjectId).join(', ') || '-';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Teacher profile</title></head><body>
    <h1>Fiche enseignant</h1>
    <p>id: ${teacher.id}</p>
    <p>Tenant: ${teacher.tenant_id}</p>
    <h2>Informations</h2>
    <form method="POST" action="/admin/teachers/${teacher.id}/update">
      <label>Prénom <input name="firstName" value="${teacher.firstName}" required /></label><br/>
      <label>Nom <input name="lastName" value="${teacher.lastName}" required /></label><br/>
      <label>Email <input name="email" type="email" value="${teacher.email}" /></label><br/>
      <label>Téléphone <input name="phone" value="${teacher.phone}" /></label><br/>
      <label>Notes <textarea name="notes">${teacher.notes}</textarea></label><br/>
      <h3>Classes assignées</h3>
      ${classRoomCheckboxes}
      <h3>Matières assignées</h3>
      ${subjectCheckboxes}
      <button type="submit">Enregistrer</button>
    </form>
    <form method="POST" action="/admin/teachers/${teacher.id}/archive"><button type="submit">Archiver</button></form>
    <h2>Affectations existantes</h2>
    <p>Classes: ${classNames}</p>
    <p>Matières: ${subjectNames}</p>
    <p><a href="/admin/teachers">Retour</a></p>
  </body></html>`;
}

function buildTenantScope(session, params) {
  if (session.role === ROLES.SUPER_ADMIN) {
    return params.tenantId;
  }
  return session.tenantId;
}

function createServer({ sessionStore = new SessionStore(), seed = createSeedData() } = {}) {
  const coreSchoolStore = new CoreSchoolStore({ classRooms: seed.classRooms, subjects: seed.subjects });
  const studentStore = new StudentStore({ students: seed.students, classRoomStore: coreSchoolStore });
  const parentStore = new ParentStore({ parents: seed.parents, links: seed.studentParentLinks, studentStore });
  const teacherStore = new TeacherStore({ teachers: seed.teachers, classRoomStore: coreSchoolStore });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const cookies = parseCookies(request.headers.cookie);
    const session = sessionStore.get(cookies.sessionId);

    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderLoginPage());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      const form = parseForm(await readBody(request));
      const user = users.find((candidate) => candidate.email === form.email && candidate.password === form.password);
      if (!user) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderLoginPage('Identifiants invalides'));
        return;
      }

      const createdSession = sessionStore.create({ userId: user.id, role: user.role, tenantId: user.tenantId });
      response.writeHead(302, { location: '/dashboard', 'set-cookie': `sessionId=${createdSession.id}; HttpOnly; Path=/; SameSite=Lax` });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      sessionStore.destroy(cookies.sessionId);
      response.writeHead(302, { location: '/login', 'set-cookie': 'sessionId=; Max-Age=0; Path=/; SameSite=Lax' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login' });
        response.end();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderDashboard(auth.context));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/students') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const classRoomId = url.searchParams.get('classRoomId') ?? '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const students = studentStore.list(auth.context.tenantId, { classRoomId: classRoomId || undefined });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentsPage(auth.context, classRooms, students, classRoomId));
      return;
    }

    if (request.method === 'GET' && /^\/admin\/students\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const studentId = url.pathname.split('/').at(-1);
      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentProfile(student));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parents = parentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentsPage(auth.context, parents));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/parents') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        const created = parentStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone'),
          email: form.get('email'),
          address: form.get('address'),
          notes: form.get('notes')
        });
        response.writeHead(302, { location: `/admin/parents/${created.id}` });
      } catch {
        response.writeHead(302, { location: '/admin/parents' });
      }
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/parents\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parentId = url.pathname.split('/').at(-1);
      const parentWithLinks = parentStore.getParentWithLinks(auth.context.tenantId, parentId);
      if (!parentWithLinks) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const students = studentStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderParentProfile(parentWithLinks, students, parentWithLinks.links));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teachers = teacherStore.list(auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeachersPage(auth.context, teachers));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/admin/teachers') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      try {
        const form = parseExtendedForm(await readBody(request));
        const created = teacherStore.create(auth.context.tenantId, {
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: form.get('email'),
          phone: form.get('phone'),
          notes: form.get('notes'),
          classRoomIds: [],
          subjectIds: []
        });
        response.writeHead(302, { location: `/admin/teachers/${created.id}` });
      } catch {
        response.writeHead(302, { location: '/admin/teachers' });
      }
      response.end();
      return;
    }

    if (request.method === 'GET' && /^\/admin\/teachers\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacherId = url.pathname.split('/').at(-1);
      const teacher = teacherStore.get(auth.context.tenantId, teacherId);
      if (!teacher) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const subjects = coreSchoolStore.list('subjects', auth.context.tenantId);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderTeacherProfile(teacher, classRooms, subjects));
      return;
    }

    const adminTeacherIdMatch = url.pathname.match(/^\/admin\/teachers\/([^/]+)\/(update|archive)$/);
    if (adminTeacherIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageTeachers(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const teacherId = adminTeacherIdMatch[1];
      const action = adminTeacherIdMatch[2];
      const form = parseExtendedForm(await readBody(request));

      try {
        if (action === 'update') {
          teacherStore.update(auth.context.tenantId, teacherId, {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
            email: form.get('email'),
            phone: form.get('phone'),
            notes: form.get('notes'),
            classRoomIds: form.getAll('classRoomIds'),
            subjectIds: form.getAll('subjectIds')
          });
        } else if (action === 'archive') {
          teacherStore.archive(auth.context.tenantId, teacherId);
        }
      } catch {
        // no-op; keep flow simple
      }

      response.writeHead(302, { location: `/admin/teachers/${teacherId}` });
      response.end();
      return;
    }

    const adminParentIdMatch = url.pathname.match(/^\/admin\/parents\/([^/]+)\/(update|archive|links)$/);
    if (adminParentIdMatch && request.method === 'POST') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canManageParents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const parentId = adminParentIdMatch[1];
      const action = adminParentIdMatch[2];
      const form = parseExtendedForm(await readBody(request));

      try {
        if (action === 'update') {
          parentStore.update(auth.context.tenantId, parentId, {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
            phone: form.get('phone'),
            email: form.get('email'),
            address: form.get('address'),
            notes: form.get('notes')
          });
        } else if (action === 'archive') {
          parentStore.archive(auth.context.tenantId, parentId);
        } else if (action === 'links') {
          const studentIds = form.getAll('studentIds');
          for (const studentId of studentIds) {
            parentStore.upsertLink(auth.context.tenantId, parentId, studentId, {
              relationship: form.get('relationship'),
              isPrimaryContact: form.get('isPrimaryContact')
            });
          }
        }
      } catch {
        // no-op; user keeps workflow simple
      }

      response.writeHead(302, { location: `/admin/parents/${parentId}` });
      response.end();
      return;
    }

    if (url.pathname === '/api/v1/students' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const students = studentStore.list(tenantId, {
        classRoomId: url.searchParams.get('classRoomId') ?? undefined
      });
      sendApiSuccess(response, students);
      return;
    }

    if (url.pathname === '/api/v1/students' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const student = studentStore.create(tenantId, payload);
        sendApiSuccess(response, student, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const studentByIdMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)$/);
    if (studentByIdMatch) {
      const studentId = studentByIdMatch[1];

      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, {
          allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
        });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const student = studentStore.get(tenantId, studentId);
        if (!student) {
          sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
          return;
        }

        sendApiSuccess(response, student);
        return;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = studentStore.update(tenantId, studentId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
            return;
          }
          sendApiSuccess(response, updated);
        } catch (error) {
          sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
        }
        return;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = studentStore.archive(tenantId, studentId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
          return;
        }
        sendApiSuccess(response, archived);
        return;
      }
    }

    if (url.pathname === '/api/v1/parents' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, parentStore.list(tenantId));
      return;
    }

    if (url.pathname === '/api/v1/parents' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const parent = parentStore.create(tenantId, payload);
        sendApiSuccess(response, parent, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const parentByIdMatch = url.pathname.match(/^\/api\/v1\/parents\/([^/]+)$/);
    if (parentByIdMatch) {
      const parentId = parentByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const parent = parentStore.getParentWithLinks(tenantId, parentId);
        if (!parent) {
          sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
          return;
        }
        sendApiSuccess(response, parent);
        return;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = parentStore.update(tenantId, parentId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
            return;
          }
          sendApiSuccess(response, updated);
        } catch (error) {
          sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
        }
        return;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }
        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = parentStore.archive(tenantId, parentId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
          return;
        }
        sendApiSuccess(response, archived);
        return;
      }
    }

    const parentLinksMatch = url.pathname.match(/^\/api\/v1\/parents\/([^/]+)\/links$/);
    if (parentLinksMatch && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        if (!Array.isArray(payload.studentIds) || payload.studentIds.length === 0) {
          throw buildValidationError('studentIds must be a non-empty array');
        }

        const links = payload.studentIds.map((studentId) =>
          parentStore.upsertLink(tenantId, parentLinksMatch[1], studentId, {
            relationship: payload.relationship,
            isPrimaryContact: payload.isPrimaryContact
          })
        );

        sendApiSuccess(response, links, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const studentParentsMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)\/parents$/);
    if (studentParentsMatch && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const student = studentStore.get(tenantId, studentParentsMatch[1], { includeArchived: false });
      if (!student) {
        sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
        return;
      }

      const links = parentStore.listLinksByStudent(tenantId, studentParentsMatch[1]).map((link) => ({
        ...link,
        parent: parentStore.get(tenantId, link.parentId, { includeArchived: true })
      }));
      sendApiSuccess(response, links);
      return;
    }

    if (url.pathname === '/api/v1/teachers' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, teacherStore.list(tenantId));
      return;
    }

    if (url.pathname === '/api/v1/teachers' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const teacher = teacherStore.create(tenantId, payload);
        sendApiSuccess(response, teacher, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const teacherByIdMatch = url.pathname.match(/^\/api\/v1\/teachers\/([^/]+)$/);
    if (teacherByIdMatch) {
      const teacherId = teacherByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const teacher = teacherStore.get(tenantId, teacherId);
        if (!teacher) {
          sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
          return;
        }
        sendApiSuccess(response, teacher);
        return;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = teacherStore.update(tenantId, teacherId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
            return;
          }
          sendApiSuccess(response, updated);
        } catch (error) {
          sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
        }
        return;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = teacherStore.archive(tenantId, teacherId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
          return;
        }
        sendApiSuccess(response, archived);
        return;
      }
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

module.exports = {
  createServer,
  createSeedData,
  parseCookies
};

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`EducLink web app running on http://localhost:${port}`);
  });
}
