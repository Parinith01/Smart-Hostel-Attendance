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
  doc.lineWidth(2).strokeColor('#000000').rect(50, 40, 495, 60).stroke();
  doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold')
     .text('JSS MAIN BUILDING BOYS HOSTEL', 60, 50, { width: 480 });
  doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
     .text(`DAILY ATTENDANCE ROSTER — ${mealType.toUpperCase()}`, 60, 70);
  doc.fillColor('#444444').fontSize(8).font('Helvetica')
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
    { label: 'TOTAL ACTIVE', value: totalStudents, color: '#333333', borderColor: '#444444' },
    { label: 'VOTED PRESENT', value: presentList.length, color: '#2e7d32', borderColor: '#2e7d32' },
    { label: 'ABSENT',        value: absentList_c.length, color: '#c62828', borderColor: '#c62828' },
    { label: 'ON LEAVE',      value: onLeaveList_c.length, color: '#e65100', borderColor: '#e65100' },
  ];

  stats.forEach((s, i) => {
    const x = 50 + i * (statW + 5);
    doc.lineWidth(1).strokeColor(s.borderColor).rect(x, statsY, statW, 45).stroke();
    doc.fillColor(s.color).fontSize(7).font('Helvetica-Bold').text(s.label, x + 8, statsY + 8, { width: statW - 16 });
    doc.fillColor('#000000').fontSize(18).font('Helvetica-Bold').text(String(s.value), x + 8, statsY + 20);
  });

  // Verified & Not-voted stats (last row)
  const verX = 50 + 4 * (statW + 5);
  doc.lineWidth(1).strokeColor('#1565c0').rect(verX, statsY, 120, 45).stroke();
  doc.fillColor('#1565c0').fontSize(7).font('Helvetica-Bold').text('VERIFIED', verX + 8, statsY + 8, { width: 104 });
  doc.fillColor('#000000').fontSize(18).font('Helvetica-Bold').text(String(verifiedList_c.length), verX + 8, statsY + 20);

  let currentY = statsY + 60;

  // ── Table Drawing Helper ──────────────────────────────────────────────────
  const drawSection = (title, list, headerBg, titleColor) => {
    if (list.length === 0) return;

    // Page break check
    if (currentY > 650) { doc.addPage(); currentY = 50; }

    // Section title bar
    doc.lineWidth(1).strokeColor(titleColor).rect(50, currentY, 495, 20).stroke();
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
  doc.lineWidth(2).strokeColor('#000000').rect(50, 40, 495, 60).stroke();
  doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold')
     .text('JSS MAIN BUILDING BOYS HOSTEL', 60, 50, { width: 480 });
  doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
     .text('COMBINED MONTHLY ATTENDANCE SUMMARY REPORT', 60, 70);
  doc.fillColor('#444444').fontSize(8).font('Helvetica')
     .text(`MONTH: ${month}   |   GENERATED: ${new Date().toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`, 60, 84);

  // ── Stats Row ─────────────────────────────────────────────────────────────
  const statsY = 115;
  const totalStudents = summaryData.length;
  const tBPres = summaryData.reduce((acc, s) => acc + s.bPresent, 0);
  const tDPres = summaryData.reduce((acc, s) => acc + s.dPresent, 0);
  const maxDays = summaryData.length > 0 ? Math.max(...summaryData.map(s => s.validDays)) : 0;

  const mStats = [
    { label: 'TOTAL STUDENTS',  value: totalStudents, color: '#333333', borderColor: '#444444' },
    { label: 'DAYS IN MONTH',   value: maxDays,       color: '#333333', borderColor: '#444444' },
    { label: "TOTAL B'FASTS",   value: tBPres,        color: '#2e7d32', borderColor: '#2e7d32' },
    { label: 'TOTAL DINNERS',   value: tDPres,        color: '#2e7d32', borderColor: '#2e7d32' },
  ];

  const mW = 110;
  mStats.forEach((s, i) => {
    const x = 50 + i * (mW + 15);
    doc.lineWidth(1).strokeColor(s.borderColor).rect(x, statsY, mW, 40).stroke();
    doc.fillColor(s.color).fontSize(7).font('Helvetica-Bold').text(s.label, x + 6, statsY + 6, { width: mW - 12 });
    doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold').text(String(s.value), x + 6, statsY + 18);
  });

  // Split students into Eligible (>= 75%) and Shortage (< 75%) based on combined average
  const eligibleStudents = summaryData.filter(s => ((s.bPercent + s.dPercent) / 2) >= 75);
  const shortageStudents = summaryData.filter(s => ((s.bPercent + s.dPercent) / 2) < 75);

  let currentY = statsY + 55;

  const drawTableHeader = (title) => {
    if (currentY > 730) { doc.addPage(); currentY = 50; }
    currentY += 10;
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text(title, 50, currentY);
    currentY += 15;
    
    doc.lineWidth(1).strokeColor('#000000').rect(50, currentY, 495, 22).stroke();
    doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
    doc.text('SL', 55, currentY + 7, { width: 18 });
    doc.text('STUDENT ID', 75, currentY + 7, { width: 60 });
    doc.text('NAME', 135, currentY + 7, { width: 120 });
    doc.text('ROOM', 255, currentY + 7, { width: 80 });
    
    doc.text('BREAKFAST', 335, currentY + 3, { width: 95, align: 'center' });
    doc.text('P | A | L | %', 335, currentY + 12, { width: 95, align: 'center' });
    
    doc.text('DINNER', 440, currentY + 3, { width: 95, align: 'center' });
    doc.text('P | A | L | %', 440, currentY + 12, { width: 95, align: 'center' });
    currentY += 22;
  };

  const drawRow = (s, idx) => {
    if (currentY > 750) {
      doc.addPage(); currentY = 50;
      drawTableHeader('(Continued)');
    }

    if (idx % 2 === 1) {
      doc.fillColor('#f5f5f5').rect(50, currentY, 495, 20).fill();
    }

    doc.fillColor('#333333').fontSize(7.5).font('Helvetica');
    doc.text(String(idx + 1), 55, currentY + 6, { width: 18 });
    doc.font('Helvetica-Bold').fillColor('#111111').text(s.id, 75, currentY + 6, { width: 60 });
    doc.font('Helvetica').fillColor('#333333').text(s.name, 135, currentY + 6, { width: 120, height: 10, lineBreak: false });
    doc.text(`${s.room_number}`, 255, currentY + 6, { width: 80 });

    doc.font('Helvetica-Bold').fontSize(7);
    
    // Breakfast
    doc.fillColor('#2e7d32').text(String(s.bPresent), 345, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 360, currentY + 6, { width: 5 });
    doc.fillColor('#c62828').text(String(s.bAbsent), 365, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 380, currentY + 6, { width: 5 });
    doc.fillColor('#f9a825').text(String(s.bLeave), 385, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 400, currentY + 6, { width: 5 });
    doc.fillColor(s.bPercent >= 75 ? '#2e7d32' : '#c62828').text(`${s.bPercent}%`, 405, currentY + 6, { width: 25, align: 'right' });

    // Dinner
    doc.fillColor('#2e7d32').text(String(s.dPresent), 450, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 465, currentY + 6, { width: 5 });
    doc.fillColor('#c62828').text(String(s.dAbsent), 470, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 485, currentY + 6, { width: 5 });
    doc.fillColor('#f9a825').text(String(s.dLeave), 490, currentY + 6, { width: 12, align: 'right' });
    doc.fillColor('#aaaaaa').text('|', 505, currentY + 6, { width: 5 });
    doc.fillColor(s.dPercent >= 75 ? '#2e7d32' : '#c62828').text(`${s.dPercent}%`, 510, currentY + 6, { width: 25, align: 'right' });

    currentY += 20;
  };

  if (eligibleStudents.length > 0) {
    drawTableHeader('ELIGIBLE STUDENTS (>= 75% ATTENDANCE)');
    eligibleStudents.forEach(drawRow);
  }

  if (shortageStudents.length > 0) {
    drawTableHeader('ATTENDANCE SHORTAGE (< 75% ATTENDANCE)');
    shortageStudents.forEach(drawRow);
  }

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
