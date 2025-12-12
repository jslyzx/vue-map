export const generateMockData = (count = 20) => {
    const center = [114.305393, 30.593099]; // Wuhan as center (matching Image 1 Hubei context)
    const tasks = [];

    const provinces = ['湖北省', '广西壮族自治区', '安徽省', '江苏省'];
    const cities = ['黄冈市', '河池市', '淮南市', '泰州市', '泉州市'];
    const districts = ['蕲春县', '罗田县', '武穴市', '黄梅县', '红安县', '宜州区', '南丹县'];
    const titles = ['[营销]10元快剪(商业大楼店)', '[营销]白玉兰酒店', '[营销]畅游钢铁', '[营销]非凡摄影', '[营销]古茗(红安店)', '[营销]100%感觉'];

    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

    for (let i = 0; i < count; i++) {
        // Generate random offset
        const lngOffset = (Math.random() - 0.5) * 2; // Spread out a bit
        const latOffset = (Math.random() - 0.5) * 2;

        // Start point
        const startLng = center[0] + lngOffset;
        const startLat = center[1] + latOffset;

        // End point (nearby)
        const endLng = startLng + (Math.random() - 0.5) * 0.1;
        const endLat = startLat + (Math.random() - 0.5) * 0.1;

        // Calculate approximate distance
        const dist = (Math.random() * 50).toFixed(2);

        const p = getRandom(provinces);
        const c = getRandom(cities);
        const d = getRandom(districts);
        const name = getRandom(titles);

        tasks.push({
            id: i + 1,
            name: name,
            province: p,
            city: c,
            district: d,
            address: `${p} ${c} ${d}`, // Detailed address
            fullAddress: `${p} ${c} ${d} xxx路xxx号`,
            start: {
                position: [startLng, startLat],
                name: `${d} (起点)`, // Simplify for visual match
                type: 'start'
            },
            end: {
                position: [endLng, endLat],
                name: `${d} (终点)`,
                type: 'end'
            },
            distance: dist,
            coordsStr: `${startLat.toFixed(6)}, ${startLng.toFixed(6)}`
        });
    }

    return tasks;
};
