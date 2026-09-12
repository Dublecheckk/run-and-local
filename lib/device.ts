import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
export async function currentPosition() {
  let precise = true;
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions({
      permissions: ['location'],
    });
    if (
      permission.location !== 'granted' &&
      permission.coarseLocation !== 'granted'
    )
      throw new Error(
        '위치 권한을 허용하거나 지도에서 출발점을 선택해 주세요.',
      );
    precise = permission.location === 'granted';
  }
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: precise,
    timeout: 12000,
    maximumAge: 30000,
  });
  if (
    !Number.isFinite(position.coords.accuracy) ||
    position.coords.accuracy > 100
  )
    throw new Error(
      '위치 오차가 100m를 넘어요. 지도에서 출발점을 직접 선택해 주세요.',
    );
  return position;
}
export async function exportFile(name: string, content: string, type: string) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const file = await Filesystem.writeFile({
      path: name,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: '런앤로컬 기록', files: [file.uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
