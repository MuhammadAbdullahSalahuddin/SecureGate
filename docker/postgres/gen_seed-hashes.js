const bcrypt = require('bcrypt');
const users = [
	{ email: 'admin@securegate.local', password: 'Admin1234!' },
	{ email: 'operator@securegate.local', password: 'Operator1234!' },
	{ email: 'auditor@securegate.local', password: 'Auditor1234!' },
];

(async () => {
	for (const u of users) {
		const hash = await bcrypt.hash(u.password, 12);
		console.log(`${u.email}: ${hash}`);
	}
})();
