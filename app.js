import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, updateDoc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. FIREBASE CONFIGURATION (ต้องใส่ค่าของคุณ)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDPZnJtY35WtJm0tKU553d6__eeh399uHU",
    authDomain: "elis-system.firebaseapp.com",
    projectId: "elis-system",
    storageBucket: "elis-system.firebasestorage.app",
    messagingSenderId: "327878315493",
    appId: "1:327878315493:web:bb89a044e3ac18f1e7330c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ตัวแปร Global
let currentUser = null;
let currentRole = 'guest'; // 'borrower' หรือ 'admin'
let dynamicFieldCount = 0;
let selectedLoanData = null;

// ==========================================
// 2. UI NAVIGATION CONTROLLERS
// ==========================================
window.switchView = (viewId) => {
    document.querySelectorAll('.app-view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
};

window.toggleAdminLogin = () => {
    const bSection = document.getElementById('borrower-login-section');
    const aSection = document.getElementById('admin-login-section');
    if (bSection.classList.contains('d-none')) {
        bSection.classList.remove('d-none');
        aSection.classList.add('d-none');
    } else {
        bSection.classList.add('d-none');
        aSection.classList.remove('d-none');
    }
};

window.switchAdminTab = (tabName) => {
    document.querySelectorAll('.admin-tab').forEach(el => el.classList.add('d-none'));
    document.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`admin-tab-${tabName}`).classList.remove('d-none');
    event.currentTarget.classList.add('active');
};

// ==========================================
// 3. AUTHENTICATION & SESSION
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Check if admin
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (adminDoc.exists()) {
            const adminData = adminDoc.data();
            if (adminData.isLocked) {
                Swal.fire('ถูกระงับสิทธิ์', 'บัญชีนี้ถูกล็อกโดยผู้ดูแลระบบ กรุณาติดต่อผู้ดูแลระบบ', 'error');
                signOut(auth);
                return;
            }
            currentRole = 'admin';
            document.getElementById('admin-role-display').innerText = `ยินดีต้อนรับ, ${adminData.name} (${adminData.position})`;
            switchView('view-admin-dashboard');
            loadAdminApplications();
            // Trigger Cloud Function for Email Login Alert via HTTP/Callable (จำลองแนวคิดไว้ในส่วน Backend)
        } else {
            currentRole = 'borrower';
            document.getElementById('borrower-name-display').innerText = user.displayName;
            // Check if profile exists
            const profileDoc = await getDoc(doc(db, "users", user.uid));
            if (!profileDoc.exists() || !profileDoc.data().idCard) {
                switchView('view-borrower-profile');
            } else {
                switchView('view-borrower-dashboard');
                loadAvailableLoans();
                loadMyApplications();
            }
        }
    } else {
        currentUser = null;
        currentRole = 'guest';
        switchView('view-login');
    }
});

window.signInWithGoogle = () => {
    signInWithPopup(auth, provider).catch(err => {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    });
};

window.loginAdmin = async () => {
    const user = document.getElementById('admin-username').value;
    const pass = document.getElementById('admin-password').value;
    // หมายเหตุ: ในระบบจริง ควรสร้าง Admin ไว้ใน Firebase Auth และให้ล็อกอินด้วย Email
    // เพื่อจำลองเคส User 'sxaiq54' จะแปลงเป็นอีเมลเฉพาะกิจสำหรับระบบนี้
    const simulatedEmail = `${user}@elis.local`; 
    
    try {
        await signInWithEmailAndPassword(auth, simulatedEmail, pass);
    } catch (error) {
        // หากเป็นการรันครั้งแรกและต้องการสร้าง Super Admin 'sxaiq54' รหัส 'elis542800'
        Swal.fire('ข้อผิดพลาด', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกล็อก', 'error');
    }
};

window.logout = () => signOut(auth);

// ==========================================
// 4. BORROWER FUNCTIONS
// ==========================================
window.skipProfile = () => {
    switchView('view-borrower-dashboard');
    loadAvailableLoans();
    loadMyApplications();
};

window.saveBorrowerProfile = async () => {
    const name = document.getElementById('prof-name').value;
    const idcard = document.getElementById('prof-idcard').value;
    const phone = document.getElementById('prof-phone').value;
    const address = document.getElementById('prof-address').value;
    
    if(!name || !idcard) return Swal.fire('แจ้งเตือน','กรุณากรอกข้อมูลสำคัญให้ครบ','warning');

    await updateDoc(doc(db, "users", currentUser.uid), {
        fullName: name, idCard: idcard, phone: phone, address: address
    }, { merge: true });
    
    Swal.fire('สำเร็จ', 'บันทึกข้อมูลสำเร็จ', 'success').then(() => {
        skipProfile();
    });
};

// ดึงรายการสินเชื่อ
function loadAvailableLoans() {
    const q = query(collection(db, "loans"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('loan-list-container');
        container.innerHTML = '';
        const now = new Date().getTime();

        snapshot.forEach(docSnap => {
            const loan = docSnap.data();
            const startT = new Date(loan.startTime).getTime();
            const endT = new Date(loan.endTime).getTime();
            const limitPassed = (now > endT + (24*60*60*1000)); // หายไปใน 24 ชม.
            
            if (limitPassed) return; // ไม่แสดงเลย
            
            let statusBadge = '';
            let cardClass = '';
            let btnState = `onclick="openLoanDetail('${docSnap.id}')"`;
            let btnText = 'ยื่นขอสินเชื่อ';

            if (now < startT) {
                statusBadge = '<span class="badge bg-secondary mb-2">ยังไม่ถึงระยะเวลา</span>';
                cardClass = 'loan-disabled';
                btnState = 'disabled';
                btnText = 'ยังไม่ถึงระยะเวลา';
            } else if (now > endT) {
                statusBadge = '<span class="badge bg-danger mb-2">หมดเขตการยื่นสินเชื่อ</span>';
                cardClass = 'loan-disabled';
                btnState = 'disabled';
                btnText = 'หมดเขตการยื่น';
            } else {
                statusBadge = '<span class="badge bg-success mb-2">เปิดรับสมัคร</span>';
            }

            container.innerHTML += `
                <div class="col-md-6 mb-4">
                    <div class="card p-3 loan-card ${cardClass}" ${btnState === 'disabled' ? '' : btnState}>
                        ${statusBadge}
                        <h5 class="text-primary fw-bold">${loan.title} <small class="text-muted">(${loan.code})</small></h5>
                        <h4 class="text-success mb-3"><i class="fas fa-coins"></i> ฿${Number(loan.limit).toLocaleString()}</h4>
                        <p class="text-muted small text-truncate">${loan.details}</p>
                        <hr>
                        <button class="btn btn-primary w-100" ${btnState}>${btnText}</button>
                    </div>
                </div>
            `;
        });
    });
}

// เปิดหน้ารายละเอียด และสร้าง Dynamic Form
window.openLoanDetail = async (loanId) => {
    const loanDoc = await getDoc(doc(db, "loans", loanId));
    selectedLoanData = { id: loanId, ...loanDoc.data() };
    
    const infoHtml = `
        <h4 class="text-primary">${selectedLoanData.title} <span class="badge bg-dark">${selectedLoanData.code}</span></h4>
        <h5 class="text-success">วงเงินอนุมัติสูงสุด: ฿${Number(selectedLoanData.limit).toLocaleString()}</h5>
        <p class="mt-3"><strong>รายละเอียด:</strong><br>${selectedLoanData.details}</p>
        <p><strong>เงื่อนไขการพิจารณา:</strong><br>${selectedLoanData.conditions}</p>
        <p class="text-danger"><i class="fas fa-calendar-times"></i> ปิดรับยื่น: ${new Date(selectedLoanData.endTime).toLocaleString('th-TH')}</p>
    `;
    document.getElementById('modal-loan-info').innerHTML = infoHtml;

    // สร้าง Form ยื่นคำร้องที่เกิดจาก Admin สร้าง
    const formContainer = document.getElementById('dynamic-user-fields');
    formContainer.innerHTML = '';
    
    if(selectedLoanData.extraFields && selectedLoanData.extraFields.length > 0) {
        selectedLoanData.extraFields.forEach((field, index) => {
            let inputHtml = '';
            if (field.type === 'text') {
                inputHtml = `<input type="text" class="form-control dynamic-input" data-id="${field.id}" required>`;
            } else if (field.type === 'gps') {
                inputHtml = `
                    <div class="input-group">
                        <input type="text" class="form-control dynamic-input" data-id="${field.id}" id="gps-${field.id}" readonly placeholder="คลิกปุ่มด้านขวาเพื่อดึงพิกัด" required>
                        <button class="btn btn-outline-info" type="button" onclick="getGPS('gps-${field.id}')"><i class="fas fa-map-marker-alt"></i> ดึงพิกัดปัจจุบัน</button>
                    </div>`;
            } else if (field.type === 'dropdown') {
                const options = field.options.split(',').map(o => `<option value="${o.trim()}">${o.trim()}</option>`).join('');
                inputHtml = `<select class="form-select dynamic-input" data-id="${field.id}" required>${options}</select>`;
            } else if (field.type === 'image') {
                inputHtml = `<input type="file" class="form-control dynamic-input" data-id="${field.id}" accept="image/*" required>`;
            }
            
            formContainer.innerHTML += `
                <div class="mb-3">
                    <label class="form-label fw-bold">${field.label}</label>
                    ${inputHtml}
                </div>
            `;
        });
    } else {
        formContainer.innerHTML = '<p class="text-muted">ไม่ต้องการข้อมูลเพิ่มเติมสำหรับสินเชื่อนี้</p>';
    }

    new bootstrap.Modal(document.getElementById('loanDetailModal')).show();
};

window.getGPS = (inputId) => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById(inputId).value = `${position.coords.latitude}, ${position.coords.longitude}`;
                Swal.fire({icon: 'success', title: 'ดึงพิกัดสำเร็จ', timer: 1000, showConfirmButton: false});
            },
            (error) => {
                Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเข้าถึงตำแหน่งได้ ต้องอนุญาต GPS เพื่อยื่นสินเชื่อ', 'error');
            }
        );
    } else {
        Swal.fire('ข้อผิดพลาด', 'อุปกรณ์ของคุณไม่รองรับ GPS', 'error');
    }
};

window.submitLoanApplication = async () => {
    // 1. ดึงข้อมูล Profile ก่อนว่าครบไหม (เผื่อกดข้ามมา)
    const profileDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (!profileDoc.exists() || !profileDoc.data().idCard) {
        Swal.fire('ข้อมูลไม่ครบ', 'คุณต้องกรอกข้อมูลส่วนตัวในระบบก่อนทำการยื่นกู้', 'warning');
        bootstrap.Modal.getInstance(document.getElementById('loanDetailModal')).hide();
        switchView('view-borrower-profile');
        return;
    }

    // 2. รวบรวมข้อมูล Dynamic Fields
    const extraAnswers = {};
    const inputs = document.querySelectorAll('.dynamic-input');
    for(let inp of inputs) {
        if(!inp.value) {
            return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบทุกช่อง', 'warning');
        }
        // กรณีอัพโหลดรูป ควรใช้ Firebase Storage แต่อันนี้จำลองชื่อไฟล์
        extraAnswers[inp.getAttribute('data-id')] = inp.type === 'file' ? inp.files[0].name : inp.value;
    }

    const appData = {
        userId: currentUser.uid,
        userName: profileDoc.data().fullName,
        userEmail: currentUser.email,
        loanId: selectedLoanData.id,
        loanTitle: selectedLoanData.title,
        loanAmount: selectedLoanData.limit,
        status: 1, // 1: ส่งคำขอ
        statusText: "ส่งคำขอพิจารณาแล้ว",
        statusRemark: "",
        deadlineDate: null,
        extraData: extraAnswers,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "applications"), appData);
        Swal.fire('สำเร็จ', 'ส่งคำขอสินเชื่อเรียบร้อยแล้ว ระบบจะอัพเดทสถานะให้ทราบ', 'success');
        bootstrap.Modal.getInstance(document.getElementById('loanDetailModal')).hide();
        // สลับไปหน้าประวัติ
        const triggerEl = document.querySelector('a[href="#tab-my-apps"]');
        bootstrap.Tab.getInstance(triggerEl) || new bootstrap.Tab(triggerEl).show();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
};

// ==========================================
// Real-time Status Tracker ผู้กู้
// ==========================================
function loadMyApplications() {
    const q = query(collection(db, "applications"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('my-apps-container');
        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const app = docSnap.data();
            
            // การจัดการสถานะ ไอคอนตามที่กำหนด
            const steps = [
                {id: 1, text: "ส่งคำขอ", icon: "fa-paper-plane"},
                {id: 2, text: "กำลังตรวจสอบ", icon: "fa-search"},
                {id: 3, text: "ตรวจสอบเสร็จ", icon: "fa-check-circle"},
                {id: 4, text: app.status === 5 ? "ไม่อนุมัติ" : "อนุมัติ", icon: app.status === 5 ? "fa-times-circle" : "fa-check-double"}
            ];

            let timelineHtml = '<div class="status-timeline">';
            let isTimeout = false;
            
            // เช็ค Deadline สำหรับขั้นตอนที่ 3
            if (app.status === 3 && app.deadlineDate) {
                const limitTime = new Date(app.deadlineDate).getTime();
                const nowTime = new Date().getTime();
                if (nowTime > limitTime) {
                    isTimeout = true; // เลยกำหนด เปลี่ยนไอคอนเป็นกากบาทในหน้าบ้านผู้กู้
                }
            }

            steps.forEach(s => {
                let stateClass = '';
                let overrideIcon = s.icon;
                
                if (s.id < app.status || (app.status >= 4 && s.id === 4)) {
                    stateClass = 'completed';
                } else if (s.id === app.status) {
                    stateClass = 'active';
                    if (s.id === 2) overrideIcon = "fa-clock"; // กำลังตรวจสอบแบบนาฬิกา
                    if (s.id === 3 && isTimeout) {
                        stateClass = 'error';
                        overrideIcon = "fa-times"; // เลยกำหนดเวลา เป็นกากบาท
                    }
                }
                
                if(s.id === 4 && app.status === 5) stateClass = 'error';

                timelineHtml += `
                    <div class="status-step ${stateClass}">
                        <div class="status-icon"><i class="fas ${overrideIcon}"></i></div>
                        <div class="small fw-bold">${s.text}</div>
                    </div>
                `;
            });
            timelineHtml += '</div>';

            container.innerHTML += `
                <div class="col-md-12 mb-4">
                    <div class="card p-4 shadow-sm border-0">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="text-primary mb-0">${app.loanTitle}</h5>
                            <span class="text-muted small">ยื่นเมื่อ: ${new Date(app.createdAt).toLocaleString('th-TH')}</span>
                        </div>
                        <p><strong>สถานะปัจจุบัน:</strong> <span class="badge bg-info text-dark">${app.statusText}</span></p>
                        ${app.statusRemark ? `<div class="alert alert-warning py-2 small"><i class="fas fa-exclamation-circle"></i> หมายเหตุ: ${app.statusRemark}</div>` : ''}
                        ${isTimeout ? `<div class="alert alert-danger py-2 small"><i class="fas fa-exclamation-triangle"></i> เลยกำหนดระยะเวลาตรวจสอบ กรุณารอเจ้าหน้าที่ดำเนินการตรวจสอบอีกครั้ง</div>` : ''}
                        
                        ${timelineHtml}
                    </div>
                </div>
            `;
        });
    });
}


// ==========================================
// 5. ADMIN FUNCTIONS
// ==========================================
window.addDynamicField = () => {
    dynamicFieldCount++;
    const container = document.getElementById('dynamic-fields-container');
    const div = document.createElement('div');
    div.className = 'dynamic-field-box position-relative';
    div.id = `df-${dynamicFieldCount}`;
    
    div.innerHTML = `
        <button type="button" class="btn-close position-absolute top-0 end-0 m-2" onclick="document.getElementById('df-${dynamicFieldCount}').remove()"></button>
        <div class="row">
            <div class="col-md-6 mb-2">
                <label class="form-label small">คำถาม / หัวข้อ</label>
                <input type="text" class="form-control df-label" required>
            </div>
            <div class="col-md-6 mb-2">
                <label class="form-label small">รูปแบบการตอบ</label>
                <select class="form-select df-type" onchange="toggleOptions(this, ${dynamicFieldCount})">
                    <option value="text">กรอกข้อความสั้น</option>
                    <option value="dropdown">ดรอปดาวน์ (เลือก 1 ข้อ)</option>
                    <option value="gps">พิกัด GPS ปัจจุบัน</option>
                    <option value="image">อัพโหลดรูปภาพ</option>
                </select>
            </div>
            <div class="col-md-12 df-options-div d-none" id="df-opt-${dynamicFieldCount}">
                <input type="text" class="form-control df-options" placeholder="ใส่ตัวเลือก คั่นด้วยลูกน้ำ (เช่น โสด,สมรส,หย่า)">
            </div>
        </div>
    `;
    container.appendChild(div);
};

window.toggleOptions = (selectEl, id) => {
    const optDiv = document.getElementById(`df-opt-${id}`);
    if (selectEl.value === 'dropdown') {
        optDiv.classList.remove('d-none');
        optDiv.querySelector('input').required = true;
    } else {
        optDiv.classList.add('d-none');
        optDiv.querySelector('input').required = false;
    }
};

window.createLoan = async () => {
    const form = document.getElementById('form-create-loan');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    // รวบรวม Dynamic Fields
    const extraFields = [];
    document.querySelectorAll('.dynamic-field-box').forEach((box, index) => {
        const type = box.querySelector('.df-type').value;
        extraFields.push({
            id: `field_${new Date().getTime()}_${index}`,
            label: box.querySelector('.df-label').value,
            type: type,
            options: type === 'dropdown' ? box.querySelector('.df-options').value : null
        });
    });

    const loanData = {
        title: document.getElementById('cl-title').value,
        code: document.getElementById('cl-code').value,
        limit: document.getElementById('cl-limit').value,
        startTime: document.getElementById('cl-start').value,
        endTime: document.getElementById('cl-end').value,
        details: document.getElementById('cl-details').value,
        conditions: document.getElementById('cl-conditions').value,
        extraFields: extraFields,
        createdBy: currentUser.uid,
        createdAt: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "loans"), loanData);
        Swal.fire('สำเร็จ', 'สร้างโครงการสินเชื่อใหม่เรียบร้อย', 'success');
        form.reset();
        document.getElementById('dynamic-fields-container').innerHTML = '';
        switchAdminTab('status');
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
};

// ==========================================
// Admin - Manage Applications Status
// ==========================================
function loadAdminApplications() {
    const q = query(collection(db, "applications"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('admin-applications-list');
        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const app = docSnap.data();
            
            // เช็ค Timeout Logic ฝั่ง Admin (ถ้า Timeout ให้ขึ้นเตือนให้ตรวจสอบอีกครั้ง)
            let isTimeout = false;
            if (app.status === 3 && app.deadlineDate) {
                if (new Date().getTime() > new Date(app.deadlineDate).getTime()) {
                    isTimeout = true;
                }
            }

            let statusBadgeClass = 'bg-secondary';
            if(app.status === 2) statusBadgeClass = 'bg-info text-dark';
            if(app.status === 3) statusBadgeClass = isTimeout ? 'bg-danger' : 'bg-primary';
            if(app.status === 4) statusBadgeClass = 'bg-success';
            if(app.status === 5) statusBadgeClass = 'bg-dark';

            let statusTextHtml = app.statusText;
            if(isTimeout) statusTextHtml += ' <span class="badge bg-warning text-dark"><i class="fas fa-exclamation"></i> รอตรวจสอบอีกครั้ง</span>';

            tbody.innerHTML += `
                <tr>
                    <td class="small">${new Date(app.createdAt).toLocaleDateString('th-TH')}</td>
                    <td><strong>${app.userName}</strong><br><small class="text-muted">${app.userEmail}</small></td>
                    <td>${app.loanTitle}</td>
                    <td>฿${Number(app.loanAmount).toLocaleString()}</td>
                    <td><span class="badge ${statusBadgeClass}">${statusTextHtml}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="openUpdateModal('${docSnap.id}', ${app.status}, '${app.deadlineDate || ''}')">อัพเดทสถานะ</button>
                    </td>
                </tr>
            `;
        });
    });
}

// Logic แสดง/ซ่อนช่อง Deadline ใน Modal
document.getElementById('us-status').addEventListener('change', function() {
    document.getElementById('us-deadline-box').style.display = this.value == "3" ? "block" : "none";
});

window.openUpdateModal = (id, currentStatus, deadline) => {
    document.getElementById('us-app-id').value = id;
    document.getElementById('us-status').value = currentStatus;
    document.getElementById('us-deadline-box').style.display = currentStatus == "3" ? "block" : "none";
    if(deadline) document.getElementById('us-deadline').value = deadline.split('T')[0];
    new bootstrap.Modal(document.getElementById('updateStatusModal')).show();
};

window.saveStatusUpdate = async () => {
    const id = document.getElementById('us-app-id').value;
    const statVal = parseInt(document.getElementById('us-status').value);
    const statText = document.getElementById('us-status').options[document.getElementById('us-status').selectedIndex].text;
    const remark = document.getElementById('us-remark').value;
    const deadline = document.getElementById('us-deadline').value;

    const payload = {
        status: statVal,
        statusText: statText,
        statusRemark: remark,
        updatedAt: new Date().toISOString()
    };

    if (statVal === 3) {
        if(!deadline) return Swal.fire('แจ้งเตือน', 'สถานะที่ 3 ต้องกำหนดวันสิ้นสุดการตรวจสอบ', 'warning');
        payload.deadlineDate = new Date(deadline).toISOString();
    }

    try {
        await updateDoc(doc(db, "applications", id), payload);
        Swal.fire('สำเร็จ', 'อัพเดทสถานะเรียบร้อย ระบบส่งการแจ้งเตือนไปยังผู้กู้แล้ว', 'success');
        bootstrap.Modal.getInstance(document.getElementById('updateStatusModal')).hide();
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    }
};

// ==========================================
// Admin - Export PDF
// ==========================================
window.exportData = (type) => {
    if(type === 'pdf') {
        const element = document.getElementById('admin-applications-table');
        const opt = {
            margin:       10,
            filename:     `eLIS_Report_${new Date().getTime()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        // ใช้ไลบรารี html2pdf ที่เชื่อมไว้ใน HTML
        html2pdf().set(opt).from(element).save();
    }
};

// ฟังก์ชันจำลองสำหรับจัดการ Admin และระบบล็อค (ต้องใช้คู่กับ Firebase Cloud Functions ในความเป็นจริง)
window.showAddAdminModal = () => {
    Swal.fire('แจ้งเตือนการออกแบบสถาปัตยกรรม', 'การเพิ่ม Admin พร้อมระบบ OTP และ Role-based Access อย่างปลอดภัย 100% ต้องอาศัย <b>Firebase Cloud Functions (Node.js)</b> ในการยิงอีเมล OTP และจัดการ Custom Claims (โค้ดเตรียมไว้ให้ในส่วนที่ 4) <br><br>UI ส่วนนี้สามารถสร้างแบบฟอร์มบันทึกลง Collection "admins" ได้ตามปกติ', 'info');
};
