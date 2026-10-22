import { describe, expect, it } from 'vitest'
import { applyEdits, prepare, validate } from './html.ts'

const page = (body: string, head = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`

describe('validate', () => {
  it('accepts a complete page that loads echarts through lib:', () => {
    const result = validate(page('<div id="c"></div><script>echarts.init(c)</script>', '<script src="lib:echarts"></script>'))
    expect(result).toMatchObject({ ok: true, libraries: ['echarts'] })
  })

  it('rejects what cannot run in the sandbox, with a reason', () => {
    expect(validate('<html><head></head><body></body></html>')).toMatchObject({ ok: false })
    expect(validate(page('', '<script src="https://cdn.jsdelivr.net/npm/echarts"></script>'))).toMatchObject({ ok: false })
    expect(validate(page('<img src="https://example.com/a.png">'))).toMatchObject({ ok: false })
    expect(validate(page('<iframe></iframe>'))).toMatchObject({ ok: false })
    expect(validate(page('<a href="javascript:alert(1)">x</a>'))).toMatchObject({ ok: false })
    expect(validate(page('', '<link rel="stylesheet" href="https://fonts.googleapis.com/x">'))).toMatchObject({ ok: false })
  })

  it('rejects an inline script that does not compile, naming the line', () => {
    // The quoting slip the model made in a slide deck on 2026-10-22.
    const bad = page("<script>\nconst a = 1\nconst row = ['n:'不含个体工商户']\n</script>")
    expect(validate(bad)).toMatchObject({ ok: false, error: expect.stringContaining('第 3 行') })
    expect(validate(page('<script>const ok = ["n:不含个体工商户"]</script>'))).toMatchObject({ ok: true })
    expect(validate(page('<script type="application/json">{"not": js</script>'))).toMatchObject({ ok: true })
  })
})

describe('applyEdits', () => {
  it('applies replacements in order', () => {
    const result = applyEdits('<h1>A</h1><p>B</p>', [
      { old_string: '<h1>A</h1>', new_string: '<h1>标题</h1>' },
      { old_string: 'B', new_string: 'C' },
    ])
    expect(result).toEqual({ ok: true, html: '<h1>标题</h1><p>C</p>' })
  })

  it('refuses a missing or ambiguous old_string, naming the edit', () => {
    expect(applyEdits('<p>x</p>', [{ old_string: 'y', new_string: 'z' }])).toMatchObject({ ok: false, error: expect.stringContaining('第 1 处') })
    expect(applyEdits('<p>x</p><p>x</p>', [{ old_string: '<p>x</p>', new_string: '' }])).toMatchObject({ ok: false })
  })
})

describe('prepare', () => {
  it('puts CSP and DATA first in head and inlines the library', () => {
    const out = prepare(page('<script>draw(DATA.d)</script>', '<script src="lib:echarts"></script>'), {
      data: { d: { columns: ['a'], rows: [{ a: '</script><script>alert(1)</script>' }] } },
      libraries: { echarts: 'window.echarts={}' },
    })
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('window.DATA'))
    expect(out).toContain('<script>window.echarts={}</script>')
    expect(out).not.toContain('lib:echarts')
    // Data cannot close its script element.
    expect(out).not.toContain('</script><script>alert(1)')
  })
})
