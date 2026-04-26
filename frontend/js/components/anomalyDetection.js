async function loadIntegrityData() {
    try {
        const res = await apiFetch(`/integrity${window.getFilterQueryString ? window.getFilterQueryString() : ''}`);
        if (!res) return;
        const data = await res.json();

        const canvas = document.getElementById('scatterChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (window.chartInstances.scatter) window.chartInstances.scatter.destroy();

        // ─── Chỉ phân loại 2 nhóm bất thường cần chú ý ──────────────────────
        const cheatPts = [];    // Nghi vấn gian lận   (effort thấp, điểm cao)
        const burnoutPts = [];  // Nguy cơ kiệt sức    (effort cao,  điểm thấp)

        let cntCheat = 0, cntBurnout = 0;

        // Lấy mean_effort / mean_score từ bản ghi đầu tiên (backend gửi kèm)
        let avgEffort = 5, avgScore = 5;
        if (data.length > 0 && data[0].mean_effort !== undefined) {
            avgEffort = data[0].mean_effort;
            avgScore = data[0].mean_score;
        } else {
            const ef = data.map(d => d.effort_score).filter(v => v != null);
            const sc = data.map(d => d.score).filter(v => v != null);
            if (ef.length) avgEffort = ef.reduce((a, b) => a + b, 0) / ef.length;
            if (sc.length) avgScore = sc.reduce((a, b) => a + b, 0) / sc.length;
        }

        data.forEach(d => {
            const pt = {
                x: d.effort_score, y: d.score,
                name: d.student_name, id: d.student_id,
                class_name: d.class_name, course_name: d.course_name,
                anomaly_type: d.anomaly_type, reason: d.reason,
                risk_level: d.risk_level
            };
            if (d.anomaly_type === 'Nghi vấn gian lận') { cheatPts.push(pt); cntCheat++; }
            else if (d.anomaly_type === 'Nguy cơ kiệt sức') { burnoutPts.push(pt); cntBurnout++; }
        });

        // ─── KPI cards ────────────────────────────────────────────────────
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setEl('anomaly-stat-cheat', cntCheat);
        setEl('anomaly-stat-burnout', cntBurnout);

        // ─── Bảng danh sách (ưu tiên gian lận trước, sau đó kiệt sức) ────
        const tbody = document.getElementById('anomaly-list-tbody');
        if (tbody) {
            tbody.innerHTML = '';
            const allOrdered = [...cheatPts, ...burnoutPts];

            if (allOrdered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-12 text-center text-slate-400">
                            <i class="fa-solid fa-circle-check text-2xl text-emerald-300 mb-2 block"></i>
                            Không phát hiện bất thường trong tuần này
                        </td>
                    </tr>`;
            } else {
                allOrdered.forEach(p => {
                    const isCheat = p.anomaly_type === 'Nghi vấn gian lận';
                    const iconStr = isCheat
                        ? '<i class="fa-solid fa-user-secret text-red-500 text-sm"></i>'
                        : '<i class="fa-solid fa-fire text-orange-500 text-sm"></i>';
                    const rowBg = isCheat ? 'bg-red-50/30' : 'bg-orange-50/30';
                    const badgeClass = isCheat
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : 'bg-orange-100 text-orange-700 border border-orange-200';

                    let riskClass = 'bg-slate-100 text-slate-600';
                    if (p.risk_level === 'Cao') riskClass = 'bg-red-100 text-red-700';
                    if (p.risk_level === 'Trung bình') riskClass = 'bg-orange-100 text-orange-700';
                    if (p.risk_level === 'Thấp') riskClass = 'bg-emerald-100 text-emerald-700';

                    const tr = document.createElement('tr');
                    tr.className = `border-b border-slate-50 hover:bg-slate-50 transition-colors ${rowBg}`;
                    tr.innerHTML = `
                        <td class="py-3 px-4 w-1/3">
                            <p class="font-medium text-slate-800 truncate" title="${p.name}">${p.name}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${p.class_name || 'N/A'}</p>
                            <p class="text-xs text-slate-400">${p.id}</p>
                        </td>
                        <td class="py-3 px-4 w-1/3">
                            <div class="flex items-start space-x-2">
                                <div class="mt-0.5 shrink-0">${iconStr}</div>
                                <div>
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeClass} mb-1">${p.anomaly_type}</span>
                                    <span class="text-[11px] text-slate-500 leading-snug block">${p.reason}</span>
                                </div>
                            </div>
                        </td>
                        <td class="py-3 px-4 text-center w-1/6">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${riskClass}">${p.risk_level}</span>
                        </td>
                        <td class="py-3 px-4 text-right w-1/6">
                            <button onclick="viewStudentDetail('${p.id}')"
                                class="text-xs font-medium text-white bg-slate-700 hover:bg-primary px-3 py-1.5 rounded-lg transition-colors">
                                Chi tiết
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        // ─── Plugin vẽ màu nền 2 vùng + đường tham chiếu trung bình ──────
        const quadrantPlugin = {
            id: 'quadrantBg',
            beforeDraw(chart) {
                const { ctx: c, chartArea: { left, right, top, bottom }, scales: { x, y } } = chart;
                const midX = x.getPixelForValue(avgEffort);
                const midY = y.getPixelForValue(avgScore);

                // Vùng Nghi vấn gian lận: trái-trên (effort thấp, điểm cao) → đỏ
                c.fillStyle = 'rgba(239, 68, 68, 0.07)';
                c.fillRect(left, top, midX - left, midY - top);

                // Vùng Nguy cơ kiệt sức: phải-dưới (effort cao, điểm thấp) → cam
                c.fillStyle = 'rgba(251, 146, 60, 0.08)';
                c.fillRect(midX, midY, right - midX, bottom - midY);

                // Đường tham chiếu trung bình
                c.save();
                c.setLineDash([6, 4]);
                c.strokeStyle = 'rgba(100, 116, 139, 0.28)';
                c.lineWidth = 1.5;
                c.beginPath(); c.moveTo(midX, top); c.lineTo(midX, bottom); c.stroke();
                c.beginPath(); c.moveTo(left, midY); c.lineTo(right, midY); c.stroke();
                c.restore();

                // Label 2 vùng bất thường
                c.save();
                c.font = 'bold 10px Inter, sans-serif';

                c.fillStyle = 'rgba(220, 38, 38, 0.55)';
                c.textAlign = 'left';
                c.fillText('! Nghi van gian lan', left + 8, top + 16);

                c.fillStyle = 'rgba(234, 88, 12, 0.65)';
                c.textAlign = 'right';
                c.fillText('~ Nguy co kiet suc', right - 8, bottom - 8);
                c.restore();
            }
        };

        // ─── Render Chart ─────────────────────────────────────────────────
        window.chartInstances.scatter = new Chart(ctx, {
            type: 'scatter',
            plugins: [quadrantPlugin],
            data: {
                datasets: [
                    {
                        label: 'Nghi vấn gian lận',
                        data: cheatPts,
                        backgroundColor: 'rgba(239, 68, 68, 0.85)',
                        borderColor: '#b91c1c',
                        borderWidth: 1.5,
                        pointRadius: 8,
                        pointHoverRadius: 11,
                        pointStyle: 'triangle'
                    },
                    {
                        label: 'Nguy cơ kiệt sức',
                        data: burnoutPts,
                        backgroundColor: 'rgba(249, 115, 22, 0.85)',
                        borderColor: '#c2410c',
                        borderWidth: 1.5,
                        pointRadius: 8,
                        pointHoverRadius: 11,
                        pointStyle: 'rectRot'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: { size: 12, family: 'Inter, sans-serif' }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(99,102,241,0.25)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 10,
                        callbacks: {
                            title(items) {
                                const p = items[0].raw;
                                return p.name || p.id || '---';
                            },
                            label(item) {
                                const p = item.raw;
                                return [
                                    `  ${p.class_name || 'N/A'} · ${p.course_name || ''}`,
                                    `  Nỗ lực: ${Number(p.x).toFixed(1)} / 10`,
                                    `  Điểm:   ${Number(p.y).toFixed(1)} / 10`,
                                    `  ${p.reason || ''}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Nỗ lực hệ thống (0 – 10)  →  Càng phải = càng chăm',
                            font: { size: 11, family: 'Inter, sans-serif' },
                            color: '#64748b'
                        },
                        min: 0,
                        suggestedMax: 10,
                        grid: { color: 'rgba(241,245,249,0.9)' },
                        ticks: { font: { size: 10 }, color: '#94a3b8' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Điểm số tuần (0 – 10)  ↑  Càng cao = điểm càng tốt',
                            font: { size: 11, family: 'Inter, sans-serif' },
                            color: '#64748b'
                        },
                        min: 0,
                        max: 10,
                        grid: { color: 'rgba(241,245,249,0.9)' },
                        ticks: { font: { size: 10 }, color: '#94a3b8' }
                    }
                },
                onClick(event, elements) {
                    if (!elements.length) return;
                    const p = elements[0].element.$context.raw;
                    if (p && p.id) viewStudentDetail(p.id);
                }
            }
        });

        // ─── Cập nhật bảng chú giải 2 vùng ──────────────────────────────
        renderQuadrantLegend(avgEffort.toFixed(1), avgScore.toFixed(1));

    } catch (error) {
        console.error('Load integrity data error:', error);
    }
}

// ─── Panel giải thích 2 vùng bất thường ──────────────────────────────────
function renderQuadrantLegend(avgEffort, avgScore) {
    const el = document.getElementById('quadrant-legend-panel');
    if (!el) return;
    el.innerHTML = `
        <div class="grid grid-cols-2 gap-3 text-[11px]">
            <div class="flex items-start gap-2.5 p-3 bg-red-50 rounded-xl border border-red-100">
                <div class="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <i class="fa-solid fa-user-secret text-red-600 text-xs"></i>
                </div>
                <div>
                    <p class="font-bold text-red-700">Nghi vấn gian lận</p>
                    <p class="text-red-500 leading-snug mt-0.5">Nỗ lực thấp nhưng điểm cao bất thường → cần xem xét lại</p>
                </div>
            </div>
            <div class="flex items-start gap-2.5 p-3 bg-orange-50 rounded-xl border border-orange-100">
                <div class="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 mt-0.5">
                    <i class="fa-solid fa-fire text-orange-600 text-xs"></i>
                </div>
                <div>
                    <p class="font-bold text-orange-700">Nguy cơ kiệt sức</p>
                    <p class="text-orange-600 leading-snug mt-0.5">Nỗ lực nhiều nhưng điểm thấp → cần hỗ trợ phương pháp học</p>
                </div>
            </div>
        </div>
        <p class="text-[10px] text-slate-400 mt-2 text-center">
            <i class="fa-solid fa-circle-info mr-1 text-indigo-400"></i>
            Đường kẻ đứt = trung bình lớp &nbsp;|&nbsp; Nỗ lực TB: <strong>${avgEffort}</strong> &nbsp;·&nbsp; Điểm TB: <strong>${avgScore}</strong>
        </p>
    `;
}
