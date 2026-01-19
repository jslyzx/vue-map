<template>
    <div class="container">
        <div class="sidebar">
            <!-- Filter Header -->
            <div class="filter-row">
                <select v-model="selectedProvince" class="select-filter" @change="onProvinceChange">
                    <option value="">全部省份</option>
                    <option v-for="(name, code) in provinceList" :key="code" :value="code">{{ name }}</option>
                </select>
                <select v-model="selectedCity" class="select-filter" @change="onCityChange">
                    <option value="">全部城市</option>
                    <option v-for="(name, code) in cityList" :key="code" :value="code">{{ name }}</option>
                </select>
                <select v-model="selectedDistrict" class="select-filter">
                    <option value="">全部区县</option>
                    <option v-for="(name, code) in districtList" :key="code" :value="code">{{ name }}</option>
                </select>
            </div>

            <!-- Search Row -->
            <div class="search-row">
                <input placeholder="搜索任务名称/地址/备注..." class="input-search" />
                <button class="btn">清空</button>
                <button class="btn">关闭</button>
            </div>

            <!-- Stats Row -->
            <div class="stats-row">
                共 {{ tasks.length }} 个点 (命中 {{ tasks.length }}) | 路线均距: {{ avgDist }} km
            </div>

            <!-- List -->
            <div class="list">
                <div v-for="task in tasks" :key="task.id" class="item" :class="{ active: currentTask?.id === task.id }"
                    @click="focusTask(task)">
                    <div class="item-header">
                        <h4>{{ task.address }}</h4>
                    </div>
                    <div class="item-body">
                        <p>{{ task.name }}</p>
                        <p class="coords">{{ task.coordsStr }}</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="map-wrapper">
            <!-- Removed toggle-group as requested -->
            <div id="map-container"></div>
        </div>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed, shallowRef, watch } from 'vue';
import AMapLoader from '@amap/amap-jsapi-loader';
import { generateMockData } from '../utils/mockData';
import { areaList } from '@vant/area-data';

// State
const map = shallowRef(null);
const tasks = ref([]);
const currentTask = ref(null);

// 省市区选择
const selectedProvince = ref('');
const selectedCity = ref('');
const selectedDistrict = ref('');

// 省份列表
const provinceList = computed(() => areaList.province_list);

// 城市列表（根据选中的省份筛选）
const cityList = computed(() => {
    if (!selectedProvince.value) return {};
    const provinceCode = selectedProvince.value.substring(0, 2);
    const cities = {};
    for (const [code, name] of Object.entries(areaList.city_list)) {
        if (code.startsWith(provinceCode)) {
            cities[code] = name;
        }
    }
    return cities;
});

// 区县列表（根据选中的城市筛选）
const districtList = computed(() => {
    if (!selectedCity.value) return {};
    const cityCode = selectedCity.value.substring(0, 4);
    const districts = {};
    for (const [code, name] of Object.entries(areaList.county_list)) {
        if (code.startsWith(cityCode)) {
            districts[code] = name;
        }
    }
    return districts;
});

// 省份改变时清空市和区
const onProvinceChange = () => {
    selectedCity.value = '';
    selectedDistrict.value = '';
};

// 城市改变时清空区
const onCityChange = () => {
    selectedDistrict.value = '';
};

// 原始数据
let allTasks = [];

// 根据省市区选择过滤数据
const filterTasks = () => {
    let filtered = [...allTasks];

    // 获取选中的名称
    const provinceName = selectedProvince.value ? areaList.province_list[selectedProvince.value] : '';
    const cityName = selectedCity.value ? areaList.city_list[selectedCity.value] : '';
    const districtName = selectedDistrict.value ? areaList.county_list[selectedDistrict.value] : '';

    if (provinceName) {
        filtered = filtered.filter(task => task.province === provinceName);
    }
    if (cityName) {
        filtered = filtered.filter(task => task.city === cityName);
    }
    if (districtName) {
        filtered = filtered.filter(task => task.district === districtName);
    }

    tasks.value = filtered;
    updateMap();
};

// 监听省市区选择变化
watch([selectedProvince, selectedCity, selectedDistrict], () => {
    filterTasks();
});

// Objects refs
let cluster = null;
let markers = [];
let lines = [];
let textMarkers = [];
let infoWindow = null;

// Config
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY;
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_JS_CODE;

window._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_CODE,
};

const avgDist = computed(() => {
    if (!tasks.value.length) return 0;
    const total = tasks.value.reduce((acc, curr) => acc + parseFloat(curr.distance), 0);
    return (total / tasks.value.length).toFixed(2);
});

const initMap = async () => {
    try {
        const AMap = await AMapLoader.load({
            key: AMAP_KEY,
            version: '2.0',
            plugins: ['AMap.MarkerCluster', 'AMap.MoveAnimation', 'AMap.Polyline', 'AMap.InfoWindow', 'AMap.Text'],
        });

        map.value = new AMap.Map('map-container', {
            viewMode: '3D',
            zoom: 10,
            center: [114.305393, 30.593099],
        });

        infoWindow = new AMap.InfoWindow({
            offset: new AMap.Pixel(0, -30),
            isCustom: false,
            closeWhenClickMap: true
        });

        // 生成并保存原始数据
        allTasks = generateMockData(40);
        tasks.value = allTasks;
        updateMap();

    } catch (e) {
        console.error('Map loading failed', e);
    }
};

const clearMapOverlays = () => {
    if (!map.value) return;

    if (cluster) {
        cluster.setMap(null);
        cluster = null;
    }

    if (markers.length) map.value.remove(markers);
    markers = [];

    if (lines.length) map.value.remove(lines);
    lines = [];

    if (textMarkers.length) map.value.remove(textMarkers);
    textMarkers = [];

    map.value.clearInfoWindow();
};

const showInfoWindow = (position, data) => {
    if (!map.value || !infoWindow) return;

    // 处理 position 可能是 LngLat 对象或数组的情况
    let positionArray;
    if (Array.isArray(position)) {
        positionArray = position;
    } else if (position && typeof position.getLng === 'function') {
        // AMap.LngLat 对象
        positionArray = [position.getLng(), position.getLat()];
    } else {
        positionArray = [0, 0];
    }

    const content = `
        <div class="info-window-content" style="padding:10px; font-size:14px; min-width:250px;">
           <div style="font-weight:bold; margin-bottom:8px;">${data.name}</div>
           <div style="font-size:12px; color:#666; margin-bottom:4px;">
                WGS84: ${data.coordsStr} <br>
                GCJ-02: ${positionArray.join(', ')}
           </div>
           <div style="margin-bottom:8px;">
             <button style="margin-right:8px; padding:2px 8px;">高德导航</button>
             <button style="padding:2px 8px;">百度导航</button>
           </div>
           
           <div class="info-row">
             <span class="label">task_name</span> <span>${data.name}</span>
           </div>
           <div class="info-row">
             <span class="label">province</span> <span>${data.province}</span>
           </div>
           <div class="info-row">
             <span class="label">city</span> <span>${data.city}</span>
           </div>
           <div class="info-row">
             <span class="label">district</span> <span>${data.district}</span>
           </div>
        </div>
    `;

    infoWindow.setContent(content);
    infoWindow.open(map.value, positionArray);
};



// Custom Cluster Render Function
// Custom Cluster Render Function
const _renderClusterMarker = (context) => {
    const count = context.count;
    let backgroundColor = 'rgba(129, 207, 67, 0.9)'; // Green inner
    let ringColor = 'rgba(129, 207, 67, 0.3)'; // Green outer ring
    let size = 30; // Inner size

    // Adjust colors/sizes based on count if needed
    if (count > 10 && count <= 50) {
        backgroundColor = 'rgba(234, 200, 77, 0.9)'; // Yellow
        ringColor = 'rgba(234, 200, 77, 0.3)';
        size = 36;
    } else if (count > 50) {
        backgroundColor = 'rgba(255, 102, 0, 0.9)'; // Orange
        ringColor = 'rgba(255, 102, 0, 0.3)';
        size = 42;
    }

    const div = document.createElement('div');
    div.style.backgroundColor = backgroundColor;
    div.style.width = size + 'px';
    div.style.height = size + 'px';
    div.style.borderRadius = '50%';
    div.style.color = '#333'; // Black text
    div.style.textAlign = 'center';
    div.style.lineHeight = size + 'px';
    div.style.fontSize = '14px';
    div.style.fontWeight = '500';
    // Use box-shadow for the outer ring as per user image
    div.style.boxShadow = `0 0 0 6px ${ringColor}`;
    div.innerHTML = count;

    context.marker.setOffset(new AMap.Pixel(-size / 2, -size / 2));
    context.marker.setContent(div);
};

const _renderMarker = (context) => {
    // Normal marker inside cluster (when zoomed in to show single but still handled by cluster plugin)
    // For now, simple blue style to match Image 1
    const content = `<div style="width: 20px; height: 30px; background-image: url(https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png); background-size: contain; background-repeat: no-repeat; cursor: pointer;"></div>`;
    context.marker.setContent(content);
    context.marker.setOffset(new AMap.Pixel(-10, -30));

    // Get data from context - data is an array of points at this location
    const data = context.data && context.data[0];
    if (data) {
        // Remove previous click listeners to avoid duplicate bindings
        context.marker.clearEvents('click');
        // Bind click event to show info window
        context.marker.on('click', (e) => {
            const position = data.lnglat || [e.lnglat.getLng(), e.lnglat.getLat()];
            showInfoWindow(position, data);
        });
    }
};


const updateMap = () => {
    if (!map.value) return;
    const AMap = window.AMap;

    clearMapOverlays();

    const allClusterPoints = [];

    tasks.value.forEach(task => {
        const startPt = task.start.position;
        const endPt = task.end.position;

        // Unified: Always push to cluster
        allClusterPoints.push({
            lnglat: startPt,
            ...task,
            pointType: 'Start'
        });
        allClusterPoints.push({
            lnglat: endPt,
            ...task,
            pointType: 'End'
        });

        // Add Dashed Line and Distance (Always shown now)
        const polyline = new AMap.Polyline({
            path: [startPt, endPt],
            isOutline: false,
            borderWeight: 1,
            strokeColor: "#333",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            strokeStyle: "dashed",
            strokeDasharray: [10, 5],
            lineJoin: 'round',
            zIndex: 50,
        });
        lines.push(polyline);

        const midLng = (startPt[0] + endPt[0]) / 2;
        const midLat = (startPt[1] + endPt[1]) / 2;

        const text = new AMap.Text({
            text: `${task.distance} <br> km`,
            anchor: 'center',
            style: {
                'padding': '4px 8px',
                'border-radius': '4px',
                'background-color': 'white',
                'border': '1px solid #ddd',
                'text-align': 'center',
                'font-size': '12px',
                'color': '#333',
                'box-shadow': '0 2px 4px rgba(0,0,0,0.1)'
            },
            position: [midLng, midLat],
            zIndex: 100
        });
        textMarkers.push(text);
    });
    map.value.add(lines);
    map.value.add(textMarkers);

    if (allClusterPoints.length > 0) {
        cluster = new AMap.MarkerCluster(map.value, allClusterPoints, {
            gridSize: 60,
            renderClusterMarker: _renderClusterMarker,
            renderMarker: _renderMarker
        });
    }
};

const focusTask = (task) => {
    currentTask.value = task;
    if (!map.value) return;
    map.value.setZoomAndCenter(12, task.start.position);
    showInfoWindow(task.start.position, task);
};



onMounted(() => {
    initMap();
});
onUnmounted(() => {
    if (map.value) map.value.destroy();
});
</script>

<style scoped>
.container {
    display: flex;
    height: 100vh;
    width: 100vw;
    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.sidebar {
    width: 380px;
    background: white;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #ddd;
    z-index: 10;
    box-shadow: 2px 0 5px rgba(0, 0, 0, 0.05);
}

.filter-row {
    display: flex;
    padding: 10px;
    gap: 5px;
    border-bottom: 1px solid #f0f0f0;
}

.select-filter {
    flex: 1;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    background: white;
    cursor: pointer;
    min-width: 0;
}

.select-filter:focus {
    outline: none;
    border-color: #409eff;
}

.select-filter:hover {
    border-color: #c0c4cc;
}

.search-row {
    display: flex;
    padding: 10px;
    gap: 8px;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
}

.input-search {
    flex: 1;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.btn {
    padding: 6px 12px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
}

.btn:hover {
    background: #f5f5f5;
}

.stats-row {
    padding: 10px;
    font-size: 12px;
    color: #666;
    background: #fafafa;
    border-bottom: 1px solid #eee;
}

.list {
    flex: 1;
    overflow-y: auto;
    background: #fdfdfd;
}

.item {
    background: #fff;
    border-bottom: 1px solid #eee;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
}

.item:hover,
.item.active {
    background: #f0f9ff;
}

.item-header h4 {
    margin: 0 0 5px 0;
    font-size: 15px;
    color: #333;
}

.item-body p {
    margin: 0;
    font-size: 12px;
    color: #666;
    line-height: 1.5;
}

.item-body .coords {
    color: #999;
}

.map-wrapper {
    flex: 1;
    position: relative;
}



#map-container {
    width: 100%;
    height: 100%;
}

:deep(.info-row) {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
}

:deep(.label) {
    color: #999;
    margin-right: 10px;
}
</style>
