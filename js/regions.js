// 전국 시/도 · 시/군/구 목록 (행사 장소 선택·지역 필터 공용)
const KOREA_REGIONS = [
  { name: '서울특별시', aliases: ['서울'], districts: ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'] },
  { name: '부산광역시', aliases: ['부산'], districts: ['강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'] },
  { name: '대구광역시', aliases: ['대구'], districts: ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'] },
  { name: '인천광역시', aliases: ['인천'], districts: ['강화군', '검단구', '계양구', '남동구', '미추홀구', '부평구', '서구', '연수구', '영종구', '옹진군', '제물포구'] },
  { name: '광주광역시', aliases: ['광주광역시'], districts: ['광산구', '남구', '동구', '북구', '서구'] },
  { name: '대전광역시', aliases: ['대전'], districts: ['대덕구', '동구', '서구', '유성구', '중구'] },
  { name: '울산광역시', aliases: ['울산'], districts: ['남구', '동구', '북구', '울주군', '중구'] },
  { name: '세종특별자치시', aliases: ['세종'], districts: [] },
  { name: '경기도', aliases: ['경기'], districts: ['가평군', '고양시', '과천시', '광명시', '광주시', '구리시', '군포시', '김포시', '남양주시', '동두천시', '부천시', '성남시', '수원시', '시흥시', '안산시', '안성시', '안양시', '양주시', '양평군', '여주시', '연천군', '오산시', '용인시', '의왕시', '의정부시', '이천시', '파주시', '평택시', '포천시', '하남시', '화성시'] },
  { name: '강원특별자치도', aliases: ['강원'], districts: ['강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군', '원주시', '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군', '화천군', '횡성군'] },
  { name: '충청북도', aliases: ['충북'], districts: ['괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군', '진천군', '청주시', '충주시'] },
  { name: '충청남도', aliases: ['충남'], districts: ['계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시', '서천군', '아산시', '예산군', '천안시', '청양군', '태안군', '홍성군'] },
  { name: '전북특별자치도', aliases: ['전북', '전라북도'], districts: ['고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군', '익산시', '임실군', '장수군', '전주시', '정읍시', '진안군'] },
  { name: '전라남도', aliases: ['전남'], districts: ['강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시', '무안군', '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군', '장성군', '장흥군', '진도군', '함평군', '해남군', '화순군'] },
  { name: '경상북도', aliases: ['경북'], districts: ['경산시', '경주시', '고령군', '구미시', '김천시', '문경시', '봉화군', '상주시', '성주군', '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군', '울진군', '의성군', '청도군', '청송군', '칠곡군', '포항시'] },
  { name: '경상남도', aliases: ['경남'], districts: ['거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군', '양산시', '의령군', '진주시', '창녕군', '창원시', '통영시', '하동군', '함안군', '함양군', '합천군'] },
  { name: '제주특별자치도', aliases: ['제주'], districts: ['서귀포시', '제주시'] },
];

const ONLINE_REGION = '온라인';

function findRegion(name) {
  return KOREA_REGIONS.find((r) => r.name === name) || null;
}

/** "전주시" → ["전주시", "전주"], "중구" → ["중구"] */
function districtKeywords(district) {
  const stem = district.replace(/[시군구]$/, '');
  return stem.length >= 2 ? [district, stem] : [district];
}

/** 시/도 select에 옵션 채우기 */
function fillRegionSelect(select, { placeholder = '시/도 선택', includeOnline = true } = {}) {
  select.innerHTML = `<option value="">${placeholder}</option>`
    + KOREA_REGIONS.map((r) => `<option value="${r.name}">${r.name}</option>`).join('')
    + (includeOnline ? `<option value="${ONLINE_REGION}">${ONLINE_REGION}</option>` : '');
}

/** 시/군/구 select를 선택한 시/도에 맞게 채우기 */
function fillDistrictSelect(select, regionName, { placeholder = '시/군/구 선택' } = {}) {
  const region = findRegion(regionName);
  const districts = region ? region.districts : [];
  select.innerHTML = `<option value="">${placeholder}</option>`
    + districts.map((d) => `<option value="${d}">${d}</option>`).join('');
  select.disabled = districts.length === 0;
}

/** 장소 문자열이 선택한 시/도·시/군/구에 해당하는지 */
function locationMatchesRegion(location, regionName, districtName) {
  if (!regionName) return true;
  const text = String(location || '');
  if (regionName === ONLINE_REGION) return text.includes(ONLINE_REGION);
  const region = findRegion(regionName);
  if (!region) return false;

  const parsed = splitLocation(text);
  if (parsed.region) {
    return parsed.region === region.name && (!districtName || parsed.district === districtName);
  }

  // 자유 입력 장소(예: "전주 컨벤션센터")는 이름으로 추정
  const regionHit = [region.name, ...region.aliases].some((k) => text.includes(k));
  const districtHit = (name) => districtKeywords(name).some((k) => text.includes(k));
  if (districtName) {
    return districtHit(districtName) && (regionHit || /[시군]$/.test(districtName));
  }
  return regionHit || region.districts.filter((d) => /[시군]$/.test(d)).some(districtHit);
}

/** "전북특별자치도 전주시 전북대 컨벤션" → { region, district, detail } */
function splitLocation(location) {
  const text = String(location || '').trim();
  if (text.startsWith(ONLINE_REGION)) {
    return { region: ONLINE_REGION, district: '', detail: text.slice(ONLINE_REGION.length).trim() };
  }
  const region = KOREA_REGIONS.find((r) => text.startsWith(r.name));
  if (!region) return { region: '', district: '', detail: text };
  let rest = text.slice(region.name.length).trim();
  const district = region.districts.find((d) => rest.startsWith(d)) || '';
  if (district) rest = rest.slice(district.length).trim();
  return { region: region.name, district, detail: rest };
}

function joinLocation(region, district, detail) {
  return [region, district, detail].map((s) => (s || '').trim()).filter(Boolean).join(' ');
}
