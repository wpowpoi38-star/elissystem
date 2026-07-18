const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

// ตั้งค่าระบบส่งอีเมล (ใช้ Gmail หรือ SMTP อื่นๆ)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "YOUR_SYSTEM_EMAIL@gmail.com",
        pass: "YOUR_APP_PASSWORD" // ใช้ App Password ของ Google
    }
});

/**
 * 1. ฟังก์ชันแจ้งเตือนสถานะเมื่อ Admin อัพเดท (Status Update) -> ส่งอีเมลหาผู้กู้เรียลไทม์
 */
exports.onApplicationStatusUpdate = functions.firestore
    .document("applications/{appId}")
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (newData.status !== oldData.status) {
            const mailOptions = {
                from: '"e-LIS System" <noreply@elis.system>',
                to: newData.userEmail,
                subject: `อัพเดทสถานะการขอสินเชื่อ ${newData.loanTitle}`,
                html: `
                    <h2>แจ้งเตือนสถานะการยื่นขอสินเชื่อ</h2>
                    <p>เรียน คุณ ${newData.userName},</p>
                    <p>คำขอสินเชื่อ <strong>${newData.loanTitle}</strong> ของคุณมีการอัพเดทสถานะ</p>
                    <p>สถานะปัจจุบัน: <strong>${newData.statusText}</strong></p>
                    <p>หมายเหตุ: ${newData.statusRemark || "-"}</p>
                    <br>
                    <p>ขอขอบคุณที่ใช้บริการ e-LIS</p>
                `
            };
            return transporter.sendMail(mailOptions);
        }
        return null;
    });

/**
 * 2. ฟังก์ชันระบบความปลอดภัย: ส่งอีเมลแจ้งเตือนการเข้าสู่ระบบ & ปุ่มล็อกบัญชี
 * ถูกเรียกเมื่อมีการเข้าสู่ระบบ (เรียกผ่าน HTTPS Callable จาก Front-end)
 */
exports.notifyLoginEvent = functions.https.onCall(async (data, context) => {
    // ต้องมีการแนบ IP มากับตัวแปร data (หาได้จากบริการ 3rd party API ตอนฝั่งหน้าบ้านเรียก)
    const { email, ip, device } = data;
    const lockLink = `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/lockAccount?email=${email}`;

    const mailOptions = {
        from: '"e-LIS Security" <security@elis.system>',
        to: email,
        subject: "แจ้งเตือนการเข้าสู่ระบบใหม่ e-LIS",
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h3 style="color: #dc3545;">แจ้งเตือนการเข้าสู่ระบบใหม่</h3>
                <p>มีการเข้าสู่ระบบบัญชีของคุณเมื่อ ${new Date().toLocaleString("th-TH")}</p>
                <ul>
                    <li><strong>IP Address:</strong> ${ip}</li>
                    <li><strong>อุปกรณ์:</strong> ${device}</li>
                </ul>
                <hr>
                <p style="color: red; font-weight: bold;">หากคุณไม่ได้เป็นคนเข้าสู่ระบบโปรดคลิกปุ่มต่อไปนี้:</p>
                <a href="${lockLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">ล็อคการใช้งานบัญชีนี้ทันที</a>
            </div>
        `
    };
    await transporter.sendMail(mailOptions);
    return { success: true };
});

/**
 * 3. ฟังก์ชัน API สำหรับกดล็อคบัญชีผ่านลิงก์ในอีเมล
 */
exports.lockAccount = functions.https.onRequest(async (req, res) => {
    const targetEmail = req.query.email;
    if (!targetEmail) return res.status(400).send("ข้อมูลไม่ครบถ้วน");

    try {
        // หา User ด้วย Email ใน Firebase Auth
        const userRecord = await admin.auth().getUserByEmail(targetEmail);
        
        // Disable ใน Auth
        await admin.auth().updateUser(userRecord.uid, { disabled: true });
        
        // แฟล็กสถานะใน Firestore ของ Admins/Users
        await db.collection("admins").doc(userRecord.uid).set({ isLocked: true }, { merge: true });

        res.status(200).send(`
            <h2 style="color: red;">บัญชี ${targetEmail} ถูกระงับการใช้งานแล้ว</h2>
            <p>ถูกล็อกโดยระบบรักษาความปลอดภัย กรุณาติดต่อผู้ดูแลระบบเพื่อปลดล็อก</p>
        `);
    } catch (error) {
        res.status(500).send("เกิดข้อผิดพลาด: " + error.message);
    }
});
