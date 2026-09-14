이 문서는 상위 `development/data/`의 데이터 생성 기록입니다. 배포 앱의 가공 데이터는 `public/data/gangneung.json`이며 `/data/gangneung.json`에서 다운로드할 수 있습니다. 아래 재현 명령과 원본 파일 목록은 공모전 전체 작업 폴더를 기준으로 합니다.

# 실제 강릉 추천용 OpenStreetMap 데이터

이 폴더의 OSM 원본과 가공 JSON은 **© OpenStreetMap contributors, ODbL-1.0**로 제공합니다. 앱 지도·데이터 설명에 출처와 [ODbL 라이선스 페이지](https://www.openstreetmap.org/copyright)를 표시하고, 공개 앱에서 사용하는 가공 데이터 `gangneung_graph.json`을 이용자가 내려받을 수 있도록 제공해야 합니다. Python 수집·정제 코드는 데이터 라이선스와 구분됩니다.

## 강릉시 전역 스냅샷과 범위

- 강릉시 OSM 행정경계 relation `2537817`(Overpass area `3602537817`)을 기준으로 전역의 보행 후보 도로를 수집합니다.
- 전역 그래프는 노드 **115,611개**, 구간 **119,797개**이며 최대 연결요소는 113,606개 노드입니다.
- 앱 그래프의 실제 도로 좌표 범위는 `[128.5803929, 37.5086897, 129.073321, 37.9168765]`입니다. 행정경계 안에 OSM 도로가 없는 산악·해상 영역은 좌표 범위에 포함되지 않습니다.
- `scripts/fetch-city-osm.py`가 공개 Overpass 서버에 부담을 주지 않도록 12개 구역을 순차 수집하고 체크포인트를 저장합니다. `scripts/build-city-graph.py`가 행정경계 밖으로 이어지는 way 구간을 다시 제거하고 그래프를 생성합니다.
- 기존 경포·초당·송정·안목 구간의 지형·고도 자료는 보존합니다. 새 확장 구간은 OSM 해안·수변·녹지 근접 및 도로·트레일 태그를 반영하며, 고도와 경사는 자료 없음으로 처리합니다.

전역 재생성 예시:

```sh
python3 scripts/fetch-city-osm.py --kind roads --output /tmp/gangneung-city-roads.json
python3 scripts/fetch-city-osm.py --kind features --output /tmp/gangneung-city-features.json
python3 scripts/build-city-graph.py \
  --roads /tmp/gangneung-city-roads.json \
  --features /tmp/gangneung-city-features.json \
  --boundary scripts/data/gangneung-boundary.json \
  --base public/data/gangneung.json \
  --output public/data/gangneung.json
```

## 이전 시범권역 스냅샷

- 수집: 2026-09-12 05:31:21 UTC / 14:31:21 KST.
- OSM 데이터베이스 기준시각: **2026-09-12 05:29:50 UTC**. 개별 도로·상점의 현장 갱신일이라는 뜻은 아닙니다.
- 원본 bbox `(south, west, north, east)`: `[37.75, 128.86, 37.82, 128.96]`.
- 앱 graph bbox `(west, south, east, north)`: `[128.86, 37.75, 128.96, 37.82]`.
- 강릉 경포·초당·송정·안목과 인접 도심 일부. 이 범위 밖 코스는 지원하지 않습니다.
- 원본 7,193,494 bytes, 고유 요소 41,778개(노드 37,998·way 3,766·relation 14).
- 노드 **17,990개**, 실제 OSM node-pair 구간 **19,956개**. 최대 연결요소는 17,849개 노드입니다. 서로 가까워도 OSM 노드가 다르면 임의 연결하지 않습니다.
- 장소 **347개**: 카페 48, 식당 236, 공원·해변 26, 관광·박물관·예술작품 23, 화장실 13, 음수대 1.

## 재현

Python 3 표준 라이브러리만 사용합니다. 프로젝트 루트에서:

```sh
python3 running_challenge_20260912/development/data/build_graph.py
```

이 명령은 저장된 원본의 SHA256 검증 후 가공자료와 요약을 다시 만들고, 참조 무결성·거리·제한태그·범위·POI 거리에 대한 실행 가능한 검사를 수행합니다. 새 스냅샷이 필요한 경우에만 아래 명령을 먼저 실행합니다.

```sh
python3 running_challenge_20260912/development/data/fetch_osm.py
```

공개 API는 앱 이용자의 추천 요청마다 호출하지 않습니다. 수집 스크립트에서 한 번 내려받은 자료를 앱에 배포합니다. 제공 서버의 과부하·이용조건을 확인한 후 수동으로 갱신합니다. 서버 정보는 [공식 OSM Overpass 문서](https://wiki.openstreetmap.org/wiki/Overpass_API)를 따랐습니다.

## 필터와 추정 규칙

1. 원본 way의 연속 두 노드만 구간으로 만듭니다. 두 끝점이 bbox 내부인 구간만 포함하며, 거리는 WGS84 좌표로 Haversine 구면거리를 계산합니다. 높이·경사를 반영한 거리가 아닙니다.
2. motorway·trunk·construction 등은 허용 highway 목록에 없어 제외합니다. `foot`/`access`의 `no`, `private`, `customers`, `permit`, `agricultural`, `forestry`와 `motorroad=yes`, 공사·폐도 태그, 제한 노드를 제외합니다. 일반 자동차 일방통행을 보행에 적용하지 않고 `oneway:foot`만 적용합니다. cycleway는 보행 허가가 명시된 경우만 포함합니다. 제한 상세는 `build_graph.py`와 `metadata.excludedWays`에 남습니다.
3. access·foot·surface·lit·sidewalk가 없으면 **unknown**입니다. 따라서 포함된 모든 도로가 현장에서 달리기 적합하거나 보행 허가·보도 설치가 검증되었다고 말할 수 없습니다. 특히 주요 도로의 보행 가능 여부는 현장 확인이 필요합니다. 실시간 통제·야간조명·현장 도로 경사·공사·날씨·혼잡도·CCTV·건널목·교통량은 검증하지 않았습니다.
4. 풍경은 구간 중점과 실제 OSM 물·해안선·해변·수로 또는 녹지 경계선까지 평면거리가 **150m 이하**인지 추정합니다. 물을 우선하고, 다음으로 녹지, 나머지는 highway 분류에 따라 도심 또는 unknown으로 둡니다. 실제 조망·그늘·환경품질 또는 이용자 평가를 뜻하지 않습니다. 관계형 다중폴리곤은 외곽 member 선을 사용합니다. 물·녹지까지 접근 가능한 보행거리를 뜻하지도 않습니다.
5. POI는 이름 있는 카페·식당·공원·관광시설과 이름 없는 화장실·음수대를 포함합니다. 원본 점좌표 또는 원본 면 경계의 실제 꼭짓점을 사용합니다. 중심점·입구를 만들어내지 않습니다. 면 POI 좌표는 최대 연결요소와 가장 가까운 경계 꼭짓점이며, `coordinateSource`로 구분됩니다.
6. POI와 보행망을 잇는 값은 실제좌표 간 직선거리입니다. **100m 이내**인 347개만 추천 후보로 제공하고 1개는 `excluded_pois.json`에 분리합니다. 가까워도 벽·강·횡단로 부재가 있을 수 있어 진입 동선이 검증되었다는 뜻이 아닙니다. `entranceVerified=false`이며 실제 매장 입구까지 턴바이턴 안내하지 않습니다.
7. 출발 프리셋 6개는 경포대·경포생태습지원·허균문학공원·강릉커피거리·안목해수욕장·강문해변의 실제 graph node입니다. 표시는 **‘인근’**으로 하며 POI 입구로 표시하지 않습니다.
8. crossing 태그가 확인된 노드는 32개입니다. 나머지 노드에 건널목이 없다고 입증한 것은 아닙니다. 영업시간 기재 POI는 12개, 주소 기재는 16개, 조명 태그 미상 구간은 19,919개입니다. 미상 정보를 영업중·안전확인·평지로 대체하지 않습니다.

## 파일

| 파일 | 역할 |
|---|---|
| `osm_raw.json` | Overpass 응답 그대로, 재현의 원본 |
| `fetch_metadata.json` | 정확한 요청·날짜·API·원본 SHA256 |
| `gangneung_graph.json` | 앱에서 사용하는 nodes/edges/pois/origins/features/metadata |
| `build_summary.json` | 가공 후 수량·지역 출발점·풍경 요약 |
| `excluded_pois.json` | 100m 연결거리 기준으로 제외한 장소 |
| `fetch_osm.py` / `build_graph.py` | 수집 / 정제·검사 |

`features[].geometry`는 GeoJSON Polygon 또는 LineString 형식이며 원본 관계형 도형의 member를 그대로 나눈 것이므로 완전한 해안·육지 채움용 데이터는 아닙니다. 경로 선은 `edges`와 `nodes`를 연결하여 그립니다.

태그 해석 출처: [foot](https://wiki.openstreetmap.org/wiki/Key:foot), [oneway:foot](https://wiki.openstreetmap.org/wiki/Key:oneway:foot). 데이터 라이선스 출처: [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).


## 지형 보강 (앱 1.1)

배포 자료는 기존 그래프를 보존한 `development/terrain/gangneung_enriched.json`입니다. 원본 Copernicus GLO-30 DSM N37E128 (AWS 2021 배포)의 SHA256·수집 기록·OSM 지형 근거와 재현 스크립트는 `development/terrain/`에 있습니다. 약 30m 픽셀을 3×3 평활화하고 두 정점 사이 거리를 최소 60m로 두어 경사를 추정합니다. 건물·수목을 포함하므로 실제 도로의 순간 최대 경사가 아닙니다. 교량·터널·계단은 미확인으로 둡니다. 경사 추정은 19,727개, 구조물 결측은 229개 구간입니다. 노면은 전체 길이의 약 76.7%가 미확인입니다.

강변·해안·호수는 OSM 도형까지 근접 근거이며 실제 조망/접근 보장이 아닙니다. 흙길·숲길 테마는 `trail` 태그를 사용합니다. 단순 숲 근접 `forest` 태그가 있는 도로를 트레일로 분류하지 않습니다. 산악 등산 난도는 자료가 없어 지원하지 않습니다.

변형 데이터 필수 고지: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved

[Copernicus DEM 라이선스](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) 및 정확한 출처·라이선스 URL은 공개 JSON의 `metadata.terrain.dem`에서 확인할 수 있습니다. OSM 파생 데이터의 ODbL 고지도 유지합니다. 원본 대용량 DEM·개인 설문 원자료·서명 키는 앱에 포함하지 않습니다.

추천은 Dijkstra 경로 탐색, 방향별 일반·테마 웨이포인트 최대 16개, 후보 점수화 및 중복 감점으로 이루어진 규칙 기반 모델입니다. 목표 거리와 최대 거리는 분리하며, 최대 거리에는 지도 연결 직선 간격도 포함합니다. 선택 테마 구간이 전체 코스 길이의 15% 이상인 혼합 코스만 남깁니다. 15%와 가중치는 설계 규칙이며 사용자 효용 검증 결과가 아닙니다. 지형·노면·조명 점수는 전체 코스 중 일치가 확인된 비율을 사용하고, 자료가 전혀 없는 항목은 미확인으로 남겨 점수 가중치를 재정규화합니다.

완만/언덕/오르막은 선호이며 알려진 경사를 반드시 제한하려면 ‘추정 경사 상한’을 별도로 켭니다. 미확인 경사까지 제외하려면 ‘경사 미확인 구간 제외’를 켭니다. 계단·주요 도로 제외도 별도 조건입니다. 고도 추정 상승 100m당 2분은 계획용 여유 가정이며 개인 체력·의학적 예측이 아닙니다. 현재 후보 탐색은 모든 가능한 경로를 탐색하지 않아 조건에 맞는 길이 존재해도 놓칠 수 있습니다.
