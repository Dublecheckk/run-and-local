# 성수·서울숲·뚝섬 실증권역 데이터

`public/data/seongsu.json`은 서·남·동·북 `[127.020, 37.510, 127.105, 37.575]` 범위의 OpenStreetMap 보행 도로망입니다. 성수·서울숲·뚝섬과 한강 남·북단, 인접 교량 연결 구간을 포함합니다.

- 노드 45,145개
- 도로 구간 53,371개
- 최대 연결요소 44,238개
- 기본 출발점: 서울숲역·서울숲공원 입구·성수역·뚝섬역·뚝섬유원지역·응봉역 인근

```bash
python3 scripts/fetch-region-osm.py --config scripts/data/seongsu-region.json --kind roads --output /tmp/seongsu-roads.json
python3 scripts/fetch-region-osm.py --config scripts/data/seongsu-region.json --kind features --output /tmp/seongsu-features.json
python3 scripts/build-region-graph.py --config scripts/data/seongsu-region.json --roads /tmp/seongsu-roads.json --features /tmp/seongsu-features.json --output public/data/seongsu.json
python3 scripts/add-terrain-elevation.py --input public/data/seongsu.json --output public/data/seongsu.json
```

Mapzen Terrain Tiles의 공개 지표면 고도를 전체 45,145개 노드에 결합했습니다. 일반 도로 51,722개 구간(전체의 약 96.9%)은 지표면 고도를 평활화하고 최소 60m 기준으로 추정 경사를 계산합니다. 지표면 고도로 구조물의 실제 높이를 알 수 없는 교량·터널·계단 1,649개 구간은 미확인으로 유지합니다. 출발지와 목적지가 보행망 연결점에서 각각 150m·100m를 넘으면 지원 범위 밖으로 처리합니다. 그 이하여도 실제 입구 연결·영업 여부·공사·조명·현장 통행은 보증하지 않습니다.

카페·디저트는 카드 원자료의 독립 소비분류 근거가 없으므로 context prior를 새로 부여하지 않습니다. 실제 성수권역 카카오 POI가 확인되는 경우에만 `식사·카페 러닝` 후보로 포함하고, MEAL 기반 prior보다 우선시키지 않습니다.

지도 데이터: © OpenStreetMap contributors, ODbL 1.0. 고도 데이터: Mapzen Terrain Tiles 및 원천 데이터 기여자(AWS Open Data Registry 배포).
