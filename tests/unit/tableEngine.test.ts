import {
  parseMarkdownPipeTable,
  parseHTMLTable,
  parseMarkdownKVTable,
  parseLatexTabular,
  parseCSVTable,
  parseUniversalTable,
  repairMalformedTable,
  protectNonTablePipes,
  auditTableFooting,
  generateCardsFromTable,
  exportTableAs,
  type CanonicalTable
} from '../../src/lib/tableEngine'

describe('Zero-Defect Tabular Engine (tableEngine)', () => {
  describe('1. Token Drift Repair & Math Delimiter Protection', () => {
    it('protects LaTeX math pipes from table splitting', () => {
      const input = '| Function | Definition |\n|---|---|\n| Absolute value | $f(x) = |x|$ |\n| Conditional | $P(A|B)$ |'
      const { protectedText, restore } = protectNonTablePipes(input)
      expect(protectedText).toContain('___TABLE_PIPE_PROTECTED_')
      const table = parseMarkdownPipeTable(input)
      expect(table).not.toBeNull()
      expect(table?.rows.length).toBe(2)
      expect(table?.rows[0][1]).toBe('$f(x) = |x|$')
      expect(table?.rows[1][1]).toBe('$P(A|B)$')
    })

    it('repairs single-line flattened markdown tables', () => {
      const flattened = '| Metric | 2023 | 2024 | |---|---|---| | GDP ($B) | 28000 | 29000 | | Inflation (%) | 3.4 | 2.8 |'
      const repaired = repairMalformedTable(flattened)
      expect(repaired).toContain('\n')
      const table = parseMarkdownPipeTable(flattened)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Metric', '2023', '2024'])
      expect(table?.rows.length).toBe(2)
      expect(table?.rows[0][0]).toBe('GDP ($B)')
    })

    it('normalizes missing column delimiters and uneven rows', () => {
      const malformed = 'Col A | Col B | Col C\n---|---|---\nVal 1 | Val 2\nVal 4 | Val 5 | Val 6 | Extra'
      const table = parseMarkdownPipeTable(malformed)
      expect(table).not.toBeNull()
      expect(table?.headers.length).toBe(3)
      expect(table?.rows[0].length).toBe(3)
      expect(table?.rows[0][2]).toBe('') // padded
      expect(table?.rows[1].length).toBe(3) // truncated extra
    })
  })

  describe('2. Multi-Format Lossless Ingestion & Parsing', () => {
    it('parses standard Markdown Pipe table with alignments', () => {
      const md = `
| Country | Code | Population | GDP (USD) |
|:---|:---:|---:|---:|
| United States | US | 335,000,000 | $28.2T |
| Germany | DE | 84,000,000 | $4.5T |
| Japan | JP | 125,000,000 | $4.2T |
      `
      const table = parseMarkdownPipeTable(md)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Country', 'Code', 'Population', 'GDP (USD)'])
      expect(table?.alignments).toEqual(['left', 'center', 'right', 'right'])
      expect(table?.rows.length).toBe(3)
      expect(table?.rows[0][0]).toBe('United States')
    })

    it('parses HTML tables with tags and attributes', () => {
      const html = `
        <table class="financial-table">
          <thead>
            <tr>
              <th>Line Item</th>
              <th>FY2022</th>
              <th>FY2023</th>
            </tr>
          </thead>
          <tbody>
            <tr data-depth="0">
              <td>Total Revenue</td>
              <td>1000</td>
              <td>1200</td>
            </tr>
            <tr data-depth="1">
              <td>Cost of Goods Sold</td>
              <td>400</td>
              <td>450</td>
            </tr>
          </tbody>
        </table>
      `
      const table = parseHTMLTable(html)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Line Item', 'FY2022', 'FY2023'])
      expect(table?.rows.length).toBe(2)
      expect(table?.hierarchicalDepth).toEqual([0, 1])
    })

    it('parses Markdown-KV format (highest LLM comprehension at 60.7%)', () => {
      const kv = `
Row 1: {"Date": "2024-Q1", "GDP": 28245.9, "CPI": 312.4}
Row 2: {"Date": "2024-Q2", "GDP": 28650.2, "CPI": 314.1}
Row 3: {"Date": "2024-Q3", "GDP": 29010.5, "CPI": 315.3}
      `
      const table = parseMarkdownKVTable(kv)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Date', 'GDP', 'CPI'])
      expect(table?.rows.length).toBe(3)
      expect(table?.rows[0]).toEqual(['2024-Q1', '28245.9', '312.4'])
    })

    it('parses LaTeX tabular and booktabs with standard error brackets', () => {
      const latex = `
\\begin{tabular}{l c c}
\\toprule
Variable & Model (1) & Model (2) \\\\
\\midrule
Rule of Law & 0.412*** & 0.285*** \\\\
 & (0.052) & (0.061) \\\\
Trade Openness & 0.014** & 0.009* \\\\
 & (0.006) & (0.005) \\\\
\\midrule
Observations & 1,840 & 1,840 \\\\
$R^2$ & 0.312 & 0.448 \\\\
\\bottomrule
\\end{tabular}
      `
      const table = parseLatexTabular(latex)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Variable', 'Model (1)', 'Model (2)'])
      expect(table?.rows.length).toBe(6)
      expect(table?.rows[0][1]).toBe('0.412***')
      expect(table?.rows[1][1]).toBe('(0.052)')
    })

    it('parses CSV and TSV formats cleanly', () => {
      const csv = 'Asset,Class,Value\nCash,Liquid,500\nBonds,Fixed Income,1500\nStocks,Equities,3000'
      const table = parseCSVTable(csv)
      expect(table).not.toBeNull()
      expect(table?.headers).toEqual(['Asset', 'Class', 'Value'])
      expect(table?.rows.length).toBe(3)
      expect(table?.rows[0][0]).toBe('Cash')
    })

    it('universal dispatcher auto-detects and parses all formats', () => {
      const pipe = '| A | B |\n|---|---|\n| 1 | 2 |'
      const kv = 'Row: {"A": 1, "B": 2}\nRow: {"A": 3, "B": 4}'
      const latex = '\\begin{tabular}{l l} A & B \\\\ 1 & 2 \\\\ \\end{tabular}'

      expect(parseUniversalTable(pipe)?.format).toBe('markdown')
      expect(parseUniversalTable(kv)?.format).toBe('markdown_kv')
      expect(parseUniversalTable(latex)?.format).toBe('latex_tabular')
    })
  })

  describe('3. Programmatic Footing & Neurosymbolic Auditing', () => {
    it('verifies correct vertical footing sums and assigns verified badge', () => {
      const table: CanonicalTable = {
        headers: ['Division', 'Revenue ($M)', 'Expenses ($M)'],
        alignments: ['left', 'right', 'right'],
        rows: [
          ['North America', '500', '300'],
          ['Europe', '300', '200'],
          ['Asia Pacific', '200', '100'],
          ['Total', '1000', '600']
        ],
        format: 'markdown'
      }

      const audit = auditTableFooting(table)
      expect(audit.isAudited).toBe(true)
      expect(audit.hasFooting).toBe(true)
      expect(audit.verticalFootingErrors.length).toBe(0)
      expect(audit.auditBadge).toBe('verified')
    })

    it('flags vertical footing arithmetic discrepancies with exact error differences', () => {
      const table: CanonicalTable = {
        headers: ['Category', 'Q1 Sales'],
        alignments: ['left', 'right'],
        rows: [
          ['Product A', '150.00'],
          ['Product B', '250.00'],
          ['Product C', '100.00'],
          ['Total', '600.00'] // Hallucinated sum! Real sum is 500.00
        ],
        format: 'markdown'
      }

      const audit = auditTableFooting(table)
      expect(audit.hasFooting).toBe(true)
      expect(audit.verticalFootingErrors.length).toBe(1)
      expect(audit.verticalFootingErrors[0]).toEqual({
        colIndex: 1,
        colHeader: 'Q1 Sales',
        expectedSum: 500,
        statedTotal: 600,
        diff: 100
      })
      expect(audit.auditBadge).toBe('discrepancy')
    })

    it('audits horizontal cross-footing totals across rows', () => {
      const table: CanonicalTable = {
        headers: ['Department', 'Jan', 'Feb', 'Mar', 'Total'],
        alignments: ['left', 'right', 'right', 'right', 'right'],
        rows: [
          ['Engineering', '100', '120', '110', '330'],
          ['Marketing', '50', '60', '70', '180']
        ],
        format: 'markdown'
      }

      const audit = auditTableFooting(table)
      expect(audit.hasCrossFooting).toBe(true)
      expect(audit.horizontalFootingErrors.length).toBe(0)
      expect(audit.auditBadge).toBe('verified')
    })
  })

  describe('4. Tabular-to-Flashcards & Practice Generator', () => {
    it('generates high-yield atomic flashcards from table rows', () => {
      const table: CanonicalTable = {
        headers: ['Drug', 'Class', 'Mechanism', 'Target'],
        alignments: ['left', 'left', 'left', 'left'],
        rows: [
          ['Carvedilol', 'Non-selective Beta Blocker', 'Beta-1, Beta-2, Alpha-1 Antagonism', 'Heart Failure'],
          ['Lisinopril', 'ACE Inhibitor', 'Inhibits Angiotensin Converting Enzyme', 'Hypertension']
        ],
        format: 'markdown'
      }

      const cards = generateCardsFromTable(table, 'Cardiology Pharmacology')
      expect(cards.length).toBeGreaterThanOrEqual(2)
      expect(cards[0].front).toContain('Cardiology Pharmacology')
      expect(cards[0].front).toContain('Class')
      expect(cards[0].back).toBe('Non-selective Beta Blocker')
      expect(cards[0].bloom_level).toBe('Remembering')
    })

    it('generates econometric regression interpretation cards', () => {
      const table: CanonicalTable = {
        headers: ['Independent Variable', 'Model (1) OLS'],
        alignments: ['left', 'center'],
        rows: [
          ['Rule of Law Index', '0.412*** (0.052)'],
          ['Trade Openness', '0.014** (0.006)']
        ],
        format: 'markdown'
      }

      const cards = generateCardsFromTable(table, 'Econometrics')
      expect(cards.length).toBe(2)
      expect(cards[0].front).toContain('[Econometrics: Econometrics]')
      expect(cards[0].back).toBe('0.412*** (0.052)')
      expect(cards[0].bloom_level).toBe('Understanding')
    })
  })

  describe('5. Multi-Format Serialization & Exporters', () => {
    const table: CanonicalTable = {
      headers: ['Item', 'Cost', 'Qty'],
      alignments: ['left', 'right', 'right'],
      rows: [
        ['Widget', '$10', '5'],
        ['Gadget', '$25', '2']
      ],
      format: 'markdown'
    }

    it('exports table as Markdown Pipe table', () => {
      const md = exportTableAs(table, 'markdown')
      expect(md).toContain('| Item | Cost | Qty |')
      expect(md).toContain('| --- | ---: | ---: |')
      expect(md).toContain('| Widget | $10 | 5 |')
    })

    it('exports table as CSV and TSV', () => {
      const csv = exportTableAs(table, 'csv')
      expect(csv).toContain('"Item","Cost","Qty"')
      expect(csv).toContain('"Widget","$10","5"')

      const tsv = exportTableAs(table, 'tsv')
      expect(tsv).toContain('Item\tCost\tQty')
    })

    it('exports table as LaTeX booktabs', () => {
      const latex = exportTableAs(table, 'latex')
      expect(latex).toContain('\\begin{tabular}{l r r}')
      expect(latex).toContain('\\toprule')
      expect(latex).toContain('Item & Cost & Qty \\\\')
      expect(latex).toContain('\\midrule')
      expect(latex).toContain('\\bottomrule')
    })

    it('exports table as JSON records', () => {
      const json = exportTableAs(table, 'json')
      const parsed = JSON.parse(json)
      expect(parsed).toEqual([
        { Item: 'Widget', Cost: '$10', Qty: '5' },
        { Item: 'Gadget', Cost: '$25', Qty: '2' }
      ])
    })
  })
})
