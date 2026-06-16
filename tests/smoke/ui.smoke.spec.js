const { test, expect } = require('@playwright/test');

async function setRangeValue(page, selector, value) {
    await page.$eval(
        selector,
        (el, nextValue) => {
            el.value = String(nextValue);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        },
        value,
    );
}

test('initial UI defaults and critical controls render', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Audio Perception Visualizer' })).toBeVisible();
    await expect(page.locator('#playPauseBtn')).toBeDisabled();
    await expect(page.locator('#togglePanLineBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#toggleDbLineBtn')).toHaveAttribute('aria-pressed', 'true');

    const renderSpeedSlider = Number(await page.locator('#analyserSmoothingSlider').inputValue());
    const renderSpeedValue = Number(await page.locator('#analyserSmoothingValue').inputValue());
    expect(renderSpeedSlider).toBeCloseTo(0.2, 5);
    expect(renderSpeedValue).toBeCloseTo(0.2, 5);

    await expect(page.getByText('Line Truncation (Past Pan Edge)')).toBeVisible();
});

test('toggle buttons update pressed state and labels', async ({ page }) => {
    await page.goto('/');

    const panLineBtn = page.locator('#togglePanLineBtn');
    await panLineBtn.click();
    await expect(panLineBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(panLineBtn).toContainText('Pan Line: Off');

    const dbLineBtn = page.locator('#toggleDbLineBtn');
    await dbLineBtn.click();
    await expect(dbLineBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(dbLineBtn).toContainText('Db Line: Off');

    const binauralBtn = page.locator('#binauralPanBtn');
    const before = (await binauralBtn.textContent() || '').trim();
    await binauralBtn.click();
    await expect(binauralBtn).toHaveAttribute('aria-pressed', 'true');
    const after = (await binauralBtn.textContent() || '').trim();
    expect(after).not.toBe(before);
});

test('slider, numeric input, and nudge controls stay in sync', async ({ page }) => {
    await page.goto('/');

    await setRangeValue(page, '#lineAlphaSlider', 0.33);
    const afterSliderMove = Number(await page.locator('#lineAlphaValue').inputValue());
    expect(afterSliderMove).toBeCloseTo(0.33, 2);

    await page.fill('#lineAlphaValue', '0.40');
    await page.locator('#lineAlphaValue').blur();
    const afterFieldChange = Number(await page.locator('#lineAlphaSlider').inputValue());
    expect(afterFieldChange).toBeCloseTo(0.4, 2);

    const beforeNudge = Number(await page.locator('#lineAlphaSlider').inputValue());
    await page.locator('.nudge-btn[data-target="lineAlphaSlider"][data-dir="1"]').click();
    const afterNudge = Number(await page.locator('#lineAlphaSlider').inputValue());
    expect(afterNudge).toBeGreaterThan(beforeNudge);
});

test('invalid upload is rejected and prompts user', async ({ page }) => {
    await page.goto('/');

    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
        dialogMessage = dialog.message();
        await dialog.accept();
    });

    await page.setInputFiles('#fileInput', {
        name: 'not-audio.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('invalid'),
    });

    await expect.poll(() => dialogMessage).toContain('Please upload an MP3 file.');
    await expect(page.locator('#playPauseBtn')).toBeDisabled();
});

test('mp3-typed upload enables play control path', async ({ page }) => {
    await page.goto('/');

    await page.setInputFiles('#fileInput', {
        name: 'sample.mp3',
        mimeType: 'audio/mpeg',
        buffer: Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    });

    await expect(page.locator('#playPauseBtn')).toBeEnabled();
});
