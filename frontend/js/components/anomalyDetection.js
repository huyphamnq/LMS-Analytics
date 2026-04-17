async function loadIntegrityData() {
    try {
        const res = await apiFetch(`/integrity${window.getFilterQueryString ? window.getFilterQueryString() : ''}`);
        if (!res) return;
        const data = await res.json();
        
        const canvas = document.getElementById('scatterChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (window.chartInstances.scatter) window.chartInstances.scatter.destroy();
        
        // Convert data for scatter
        const normalPoints = [];
        const anomalyPoints = [];
        let cheatingCount = 0;
        let burnoutCount = 0;
        let othersCount = 0;
        
        data.forEach(d => {
            if (d.anomaly_type && d.anomaly_type !== "Bình thường") {
                const pt = { 
                    x: d.effort_score, 
                    y: d.score, 
                    name: d.student_name, 
                    id: d.student_id, 
                    class_name: d.class_name, 
                    course_name: d.course_name,
                    anomaly_type: d.anomaly_type,
                    reason: d.reason,
                    risk_level: d.risk_level
                };
                anomalyPoints.push(pt);
                
                if (d.anomaly_type === "Nghi vấn gian lận") cheatingCount++;
                else if (d.anomaly_type === "Nguy cơ kiệt sức") burnoutCount++;
                else othersCount++;
            } else {
                normalPoints.push({ x: d.effort_score, y: d.score, name: d.student_name, id: d.student_id });
            }
        });

        // Update stats
        document.getElementById('anomaly-stat-total').innerText = cheatingCount + burnoutCount + othersCount;
        document.getElementById('anomaly-stat-cheating').innerText = cheatingCount;
        document.getElementById('anomaly-stat-burnout').innerText = burnoutCount;
        document.getElementById('anomaly-stat-others').innerText = othersCount;

        // Render Anomaly List Table
        const tbody = document.getElementById('anomaly-list-tbody');
        if(tbody) {
            tbody.innerHTML = '';
            anomalyPoints.forEach(p => {
                let iconStr = '<i class="fa-solid fa-bolt text-blue-500 text-xs"></i>';
                if (p.anomaly_type === "Nghi vấn gian lận") iconStr = '<i class="fa-solid fa-user-secret text-red-500 text-xs"></i>';
                if (p.anomaly_type === "Nguy cơ kiệt sức") iconStr = '<i class="fa-solid fa-fire text-orange-500 text-xs"></i>';
                
                let riskClass = 'bg-slate-100 text-slate-700';
                if (p.risk_level === 'Cao') riskClass = 'bg-red-100 text-red-700';
                if (p.risk_level === 'Trung bình') riskClass = 'bg-orange-100 text-orange-700';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="py-3 px-4 w-1/3">
                        <p class="font-medium text-slate-800 truncate" title="${p.name}">${p.name}</p>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">${p.class_name || 'N/A'}</p>
                        <p class="text-xs text-slate-500">${p.id}</p>
                    </td>
                    <td class="py-3 px-4 w-1/3">
                        <div class="flex items-start space-x-2">
                            <div class="mt-0.5">${iconStr}</div>
                            <div>
                                <span class="text-slate-700 font-medium text-sm block leading-tight">${p.anomaly_type}</span>
                                <span class="text-[11px] text-slate-500 leading-tight mt-1 truncate block max-w-[200px]" title="${p.reason}">${p.reason}</span>
                            </div>
                        </div>
                    </td>
                    <td class="py-3 px-4 text-center w-1/6">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${riskClass}">${p.risk_level}</span>
                    </td>
                    <td class="py-3 px-4 text-right w-1/6">
                        <button onclick="viewStudentDetail('${p.id}')" class="text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap">Chi tiết</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        
        window.chartInstances.scatter = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Sinh viên bình thường',
                        data: normalPoints,
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        borderColor: '#4338ca',
                        pointRadius: 6,
                        pointHoverRadius: 9
                    },
                    {
                        label: '🚩 Có dấu hiệu bất thường (Cần chú ý)',
                        data: anomalyPoints,
                        backgroundColor: 'rgba(239, 68, 68, 0.8)',
                        borderColor: '#b91c1c',
                        pointRadius: 8,
                        pointHoverRadius: 11,
                        pointStyle: 'triangle'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const p = ctx.raw;
                                return `${p.name} (${p.id}) - Nỗ lực: ${p.x.toFixed(1)} | Điểm: ${p.y}`;
                            }
                        }
                    },
                    legend: { position: 'top' }
                },
                scales: {
                    x: { title: { display: true, text: 'Chỉ số nỗ lực (dựa trên hoạt động hệ thống)', font: {weight: 'bold'} }, grid: { borderDash: [5,5] } },
                    y: { title: { display: true, text: 'Điểm số hàng tuần (0-10)', font: {weight: 'bold'} }, min: 0, max: 10, grid: { borderDash: [5,5] } }
                }
            }
        });
    } catch (error) {
        console.error("Load integrity data error:", error);
    }
}
