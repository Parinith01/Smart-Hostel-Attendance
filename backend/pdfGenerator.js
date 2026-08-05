/**
 * Generates a clean, professional daily roster PDF with 4 color-coded sections.
 * Order: 1) Present (Verified), 2) On Long Leave, 3) Absent, 4) Not Voted
 */
export async function generateDailyRosterPDF(res, date, mealType, roster) {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="roster_${mealType}_${date}.pdf"`);
  doc.pipe(res);

  const accentColor = mealType === 'breakfast' ? '#00838f' : '#ad1457';
  const accentLight = mealType === 'breakfast' ? '#00e5ff' : '#f06292';

  // ── Header Block ──────────────────────────────────────────────────────────
  doc.fillColor('#0d0d1a').rect(50, 40, 495, 60).fill();
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
     .text('JSS MAIN BUILDING BOYS HOSTEL', 60, 50, { width: 480 });
  doc.fillColor(accentLight).fontSize(10).font('Helvetica-Bold')
     .text(`DAILY ATTENDANCE ROSTER — ${mealType.toUpperCase()}`, 60, 70);
  doc.fillColor('#aaaaaa').fontSize(8).font('Helvetica')
     .text(`DATE: ${date}   |   GENERATED: ${new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`, 60, 84);

  // ── Stats Summary Row ─────────────────────────────────────────────────────
  const totalStudents = roster.length;
  const presentList    = roster.filter(s => (mealType === 'breakfast' ? s.breakfast_vote : s.dinner_vote) === 'Present');
  const verifiedList_c = presentList.filter(s => mealType === 'breakfast' ? s.breakfast_verified : s.dinner_verified);
  const absentList_c   = roster.filter(s => !s.on_leave && (mealType === 'breakfast' ? s.breakfast_vote : s.dinner_vote) === 'Absent');
  const onLeaveList_c  = roster.filter(s => s.on_leave);
  const notVotedList_c = roster.filter(s => !s.on_leave && (mealType === 'breakfast' ? s.breakfast_vote : s.dinner_vote) === 'Not Voted');
  const notVotedOrUnverList = roster.filter(s =>
    !s.on_leave &&
    !verifiedList_c.some(pv => pv.id === s.id) &&
    !absentList_c.some(ab => ab.id === s.id)
  );

  const statsY = 115;
  const statW = 116;
  const stats = [
    { label: 'TOTAL ACTIVE', value: totalStudents, color: '#555555', bg: '#f5f5f5' },
    { label: 'VOTED PRESENT', value: presentList.length, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'ABSENT',        value: absentList_c.length, color: '#c62828', bg: '#ffebee' },
    { label: 'ON LEAVE',      value: onLeaveList_c.length, color: '#e65100', bg: '#fff3e0' },
  ];

  stats.forEach((s, i) => {
    const x = 50 + i * (statW + 5);
    doc.fillColor(s.bg).rect(x, statsY, statW, 45).fill();
    doc.fillColor(s.color).fontSize(7).font('Helvetica-Bold').text(s.label, x + 8, statsY + 8, { width: statW - 16 });
    doc.fillColor('#111111').fontSize(18).font('Helvetica-Bold').text(String(s.value), x + 8, statsY + 20);
  });

  // Verified & Not-voted stats (last row)
  const verX = 50 + 4 * (statW + 5);
  doc.fillColor('#e3f2fd').rect(verX, statsY, 120, 45).fill();
  doc.fillColor('#1565c0').fontSize(7).font('Helvetica-Bold').text('VERIFIED', verX + 8, statsY + 8, { width: 104 });
  doc.fillColor('#111111').fontSize(18).font('Helvetica-Bold').text(String(verifiedList_c.length), verX + 8, statsY + 20);

  let currentY = statsY + 60;

  // ── Table Drawing Helper ──────────────────────────────────────────────────
  const drawSection = (title, list, headerBg, titleColor) => {
    if (list.length === 0) return;

    // Page break check
    if (currentY > 650) { doc.addPage(); currentY = 50; }

    // Section title bar
    doc.fillColor(headerBg).rect(50, currentY, 495, 20).fill();
    doc.fillColor(titleColor).fontSize(9).font('Helvetica-Bold')
       .text(title.toUpperCase(), 60, currentY + 6, { width: 480 });
    currentY += 20;

    // Column headers
    doc.fillColor('#e0e0e0').rect(50, currentY, 495, 16).fill();
    doc.fillColor('#222222').fontSize(7).font('Helvetica-Bold');
    doc.text('SL', 60, currentY + 5, { width: 22 });
    doc.text('STUDENT ID', 85, currentY + 5, { width: 65 });
    doc.text('NAME', 155, currentY + 5, { width: 150 });
    doc.text('ROOM & BLOCK', 315, currentY + 5, { width: 100 });
    doc.text('VOTE STATUS', 420, currentY + 5, { width: 70 });
    doc.text('VERIFIED', 490, currentY + 5, { width: 50 });
    currentY += 16;

    list.forEach((s, idx) => {
      if (currentY > 760) {
        doc.addPage(); currentY = 50;
        doc.fillColor('#e0e0e0').rect(50, currentY, 495, 16).fill();
        doc.fillColor('#222222').fontSize(7).font('Helvetica-Bold');
        doc.text('SL', 60, currentY + 5, { width: 22 });
        doc.text('STUDENT ID', 85, currentY + 5, { width: 65 });
        doc.text('NAME', 155, currentY + 5, { width: 150 });
        doc.text('ROOM & BLOCK', 315, currentY + 5, { width: 100 });
        doc.text('VOTE STATUS', 420, currentY + 5, { width: 70 });
        doc.text('VERIFIED', 490, currentY + 5, { width: 50 });
        currentY += 16;
      }

      if (idx % 2 === 1) {
        doc.fillColor('#fafafa').rect(50, currentY, 495, 16).fill();
      }

      const vote = mealType === 'breakfast' ? s.breakfast_vote : s.dinner_vote;
      const isVerified = mealType === 'breakfast' ? s.breakfast_verified : s.dinner_verified;

      doc.fillColor('#333333').fontSize(7.5).font('Helvetica');
      doc.text(String(idx + 1), 60, currentY + 4, { width: 22 });
      doc.font('Helvetica-Bold').fillColor('#111111').text(s.id, 85, currentY + 4, { width: 65 });
      doc.font('Helvetica').fillColor('#333333').text(s.name, 155, currentY + 4, { width: 150 });
      doc.text(`${s.room_number} (${s.block})`, 315, currentY + 4, { width: 100 });

      // Vote column — color coded
      if (s.on_leave) {
        doc.fillColor('#e65100').font('Helvetica-Bold').text('ON LEAVE', 420, currentY + 4, { width: 70 });
      } else if (vote === 'Present') {
        doc.fillColor('#2e7d32').font('Helvetica-Bold').text('✓ PRESENT', 420, currentY + 4, { width: 70 });
      } else if (vote === 'Absent') {
        doc.fillColor('#c62828').font('Helvetica-Bold').text('✗ ABSENT', 420, currentY + 4, { width: 70 });
      } else {
        doc.fillColor('#757575').font('Helvetica').text('NOT VOTED', 420, currentY + 4, { width: 70 });
      }

      // Verified column — color coded
      if (isVerified) {
        doc.fillColor('#2e7d32').font('Helvetica-Bold').text('VERIFIED', 490, currentY + 4, { width: 50 });
      } else {
        doc.fillColor('#aaaaaa').font('Helvetica').text('—', 490, currentY + 4, { width: 50 });
      }

      currentY += 16;
    });

    currentY += 14; // section gap
  };

  // ── Draw 4 Sections in order: Present(Verified), On Leave, Absent, Not Voted ──
  drawSection(
    `✓ Present & Verified Students (${verifiedList_c.length})`,
    verifiedList_c,
    '#c8e6c9',  // light green bg
    '#1b5e20'   // dark green title
  );

  drawSection(
    `◷ On Long Leave Students (${onLeaveList_c.length})`,
    onLeaveList_c,
    '#fff3e0',  // light orange bg
    '#e65100'   // orange title
  );

  drawSection(
    `✗ Absent Students (${absentList_c.length})`,
    absentList_c,
    '#ffcdd2',  // light red bg
    '#b71c1c'   // dark red title
  );

  drawSection(
    `⊘ Not Voted / Unverified Students (${notVotedOrUnverList.length})`,
    notVotedOrUnverList,
    '#eeeeee',  // light grey bg
    '#424242'   // dark grey title
  );

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor('#888888').fontSize(7).font('Helvetica').text(
      `JSS Main Building Boys Hostel Management System  |  ${mealType.toUpperCase()} ROSTER ${date}  |  Page ${i + 1} of ${pageCount}`,
      50, 790, { align: 'center', width: 495 }
    );
  }

  doc.end();
}

/**
 * Generates a clean, professional combined monthly present/absent summary PDF.
 */
export async function generateMonthlySummaryPDF(res, month, summaryData) {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="monthly_report_${month}.pdf"`);
  doc.pipe(res);

  // ── Header Block ──────────────────────────────────────────────────────────
  doc.fillColor('#0d0d1a').rect(50, 40, 495, 60).fill();
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
     .text('JSS MAIN BUILDING BOYS HOSTEL', 60, 50, { width: 480 });
  doc.fillColor('#00e5ff').fontSize(10).font('Helvetica-Bold')
     .text('COMBINED MONTHLY ATTENDANCE SUMMARY REPORT', 60, 70);
  doc.fillColor('#aaaaaa').fontSize(8).font('Helvetica')
     .text(`MONTH: ${month}   |   GENERATED: ${new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`, 60, 84);

  // ── Stats Row ─────────────────────────────────────────────────────────────
  const statsY = 115;
  const totalStudents = summaryData.length;
  const totalBPresent = summaryData.reduce((acc, s) => acc + s.bPresent, 0);
  const totalBAbsent  = summaryData.reduce((acc, s) => acc + s.bAbsent,  0);
  const totalDPresent = summaryData.reduce((acc, s) => acc + s.dPresent, 0);
  const totalDAbsent  = summaryData.reduce((acc, s) => acc + s.dAbsent,  0);

  const mStats = [
    { label: 'TOTAL STUDENTS',  value: totalStudents, color: '#555555', bg: '#f5f5f5' },
    { label: 'BREAKFAST PRES.', value: totalBPresent,  color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'BREAKFAST ABS.',  value: totalBAbsent,   color: '#c62828', bg: '#ffebee' },
    { label: 'DINNER PRESENT',  value: totalDPresent,  color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'DINNER ABSENT',   value: totalDAbsent,   color: '#c62828', bg: '#ffebee' },
  ];

  const mW = 94;
  mStats.forEach((s, i) => {
    const x = 50 + i * (mW + 4);
    doc.fillColor(s.bg).rect(x, statsY, mW, 40).fill();
    doc.fillColor(s.color).fontSize(6.5).font('Helvetica-Bold').text(s.label, x + 6, statsY + 6, { width: mW - 12 });
    doc.fillColor('#111111').fontSize(16).font('Helvetica-Bold').text(String(s.value), x + 6, statsY + 18);
  });

  // ── Table ─────────────────────────────────────────────────────────────────
  let currentY = statsY + 55;

  // Header row
  doc.fillColor('#1a1a2e').rect(50, currentY, 495, 22).fill();
  doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
  doc.text('SL', 60, currentY + 7, { width: 22 });
  doc.text('STUDENT ID', 85, currentY + 7, { width: 65 });
  doc.text('NAME', 155, currentY + 7, { width: 140 });
  doc.text('ROOM & BLOCK', 305, currentY + 7, { width: 100 });
  doc.text('BREAKFAST', 415, currentY + 3, { width: 65, align: 'center' });
  doc.text('PRES / ABS', 415, currentY + 12, { width: 65, align: 'center' });
  doc.text('DINNER', 485, currentY + 3, { width: 55, align: 'center' });
  doc.text('PRES / ABS', 485, currentY + 12, { width: 55, align: 'center' });
  currentY += 22;

  summaryData.forEach((s, idx) => {
    if (currentY > 750) {
      doc.addPage(); currentY = 50;
      doc.fillColor('#1a1a2e').rect(50, currentY, 495, 22).fill();
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      doc.text('SL', 60, currentY + 7, { width: 22 });
      doc.text('STUDENT ID', 85, currentY + 7, { width: 65 });
      doc.text('NAME', 155, currentY + 7, { width: 140 });
      doc.text('ROOM & BLOCK', 305, currentY + 7, { width: 100 });
      doc.text('BREAKFAST', 415, currentY + 3, { width: 65, align: 'center' });
      doc.text('PRES / ABS', 415, currentY + 12, { width: 65, align: 'center' });
      doc.text('DINNER', 485, currentY + 3, { width: 55, align: 'center' });
      doc.text('PRES / ABS', 485, currentY + 12, { width: 55, align: 'center' });
      currentY += 22;
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.fillColor('#f5f5f5').rect(50, currentY, 495, 20).fill();
    }

    doc.fillColor('#333333').fontSize(7.5).font('Helvetica');
    doc.text(String(idx + 1), 60, currentY + 6, { width: 22 });
    doc.font('Helvetica-Bold').fillColor('#111111').text(s.id, 85, currentY + 6, { width: 65 });
    doc.font('Helvetica').fillColor('#333333').text(s.name, 155, currentY + 6, { width: 140 });
    doc.text(`${s.room_number} (${s.block})`, 305, currentY + 6, { width: 100 });

    // Breakfast — green / red
    doc.font('Helvetica-Bold');
    doc.fillColor('#2e7d32').text(String(s.bPresent), 415, currentY + 6, { width: 28, align: 'right' });
    doc.fillColor('#aaaaaa').text(' / ', 443, currentY + 6, { width: 10 });
    doc.fillColor('#c62828').text(String(s.bAbsent), 453, currentY + 6, { width: 22, align: 'left' });

    // Dinner — green / red
    doc.fillColor('#2e7d32').text(String(s.dPresent), 485, currentY + 6, { width: 26, align: 'right' });
    doc.fillColor('#aaaaaa').text(' / ', 511, currentY + 6, { width: 10 });
    doc.fillColor('#c62828').text(String(s.dAbsent), 521, currentY + 6, { width: 22, align: 'left' });

    currentY += 20;
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor('#888888').fontSize(7).font('Helvetica').text(
      `JSS Main Building Boys Hostel Management System  |  MONTHLY REPORT ${month}  |  Page ${i + 1} of ${pageCount}`,
      50, 790, { align: 'center', width: 495 }
    );
  }

  doc.end();
}
