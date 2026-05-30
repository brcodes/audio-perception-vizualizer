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

    await expect(page.getByRole('heading', { name: 'Music Mix Mapper' })).toBeVisible();
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

test('model switch shows perceptual controls and limits high band counts', async ({ page }) => {
    await page.goto('/');

    const modelABtn = page.locator('#modelABtn');
    const modelBBtn = page.locator('#modelBBtn');

    await expect(modelABtn).toHaveAttribute('aria-pressed', 'true');
    await expect(modelBBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#toggleDbLineBtn')).toBeVisible();
    await expect(page.locator('#perceptualSpeakerBtn')).toBeHidden();

    await modelBBtn.click();

    await expect(modelABtn).toHaveAttribute('aria-pressed', 'false');
    await expect(modelBBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#toggleDbLineBtn')).toBeHidden();
    await expect(page.locator('#perceptualSpeakerBtn')).toBeVisible();
    await expect(page.locator('#perceptualDistanceSlider')).toBeVisible();
    await expect(page.locator('#bands49Btn')).toBeDisabled();
    await expect(page.locator('#bands77Btn')).toBeDisabled();
    await expect(page.locator('#bands99Btn')).toBeDisabled();
    await expect(page.locator('#bands25Btn')).toBeEnabled();

    await modelABtn.click();
    await expect(page.locator('#toggleDbLineBtn')).toBeVisible();
    await expect(page.locator('#perceptualSpeakerBtn')).toBeHidden();
    await expect(page.locator('#bands49Btn')).toBeEnabled();
});

test('perceptual mode toggles update labels and pressed state', async ({ page }) => {
    await page.goto('/');
    await page.locator('#modelBBtn').click();

    const phonGuideBtn = page.locator('#togglePhonGridBtn');
    const earLevelBtn = page.locator('#toggleEarLevelBtn');

    await expect(phonGuideBtn).toContainText('Phon Guide: Off');
    await phonGuideBtn.click();
    await expect(phonGuideBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(phonGuideBtn).toContainText('Phon Guide: On');

    await expect(earLevelBtn).toContainText('Ear Level: On');
    await earLevelBtn.click();
    await expect(earLevelBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(earLevelBtn).toContainText('Ear Level: Off');
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
