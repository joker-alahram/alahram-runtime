export async function renderFieldLocation(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-loading">جاري تحديد الموقع...</div></div>';

  try {
    const pos = await _gps();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const acc = pos.coords.accuracy;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    container.innerHTML = `<div class="v2-fv">
      <div class="v2-fv-dh"><h2 class="v2-fv-dc">موقعي الحالي</h2></div>
      <div class="v2-fv-di">
        <div><span class="v2-fv-lbl">خط العرض:</span> ${lat}</div>
        <div><span class="v2-fv-lbl">خط الطول:</span> ${lng}</div>
        <div><span class="v2-fv-lbl">الدقة:</span> ${Math.round(acc)} متر</div>
      </div>
      <div class="v2-dash-actions">
        <a href="${mapsUrl}" target="_blank" rel="noopener" class="v2-dash-btn">فتح في خرائط Google</a>
        <button class="v2-dash-btn" id="v2-loc-refresh">تحديث الموقع</button>
      </div>
    </div>`;

    container.querySelector('#v2-loc-refresh')?.addEventListener('click', () => renderFieldLocation(container));
  } catch (e) {
    const msg = e.code === 1 ? 'الرجاء السماح بتحديد الموقع في المتصفح' : 'فشل تحديد الموقع';
    container.innerHTML = `<div class="v2-fv"><div class="v2-fv-error"><p>${msg}</p><button class="v2-retry">إعادة المحاولة</button></div></div>`;
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderFieldLocation(container));
  }
}

function _gps() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('GPS غير متوفر')); return; }
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}
