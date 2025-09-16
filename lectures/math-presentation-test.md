# Math Rendering Test in Presentation Mode

This document tests LaTeX math rendering in presentation mode.

---

# Slide 1: Basic Math

## Inline Math Test

Here's some inline math: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$ in the middle of text.

The famous equation $E = mc^2$ shows energy-mass equivalence.

## Display Math Test

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

---

# Slide 2: Complex Equations

## Multiple Display Equations

The Pythagorean theorem:
$$
a^2 + b^2 = c^2
$$

The normal distribution:
$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

## Mixed Inline and Display

The derivative of $\sin(x)$ is $\cos(x)$, and we can show this using:

$$
\frac{d}{dx}\sin(x) = \lim_{h \to 0} \frac{\sin(x+h) - \sin(x)}{h} = \cos(x)
$$

---

# Slide 3: Advanced Math

## Matrix Example

$$
\begin{pmatrix}
1 & 2 & 3 \\
4 & 5 & 6 \\
7 & 8 & 9
\end{pmatrix}
\begin{pmatrix}
x \\
y \\
z
\end{pmatrix}
=
\begin{pmatrix}
x + 2y + 3z \\
4x + 5y + 6z \\
7x + 8y + 9z
\end{pmatrix}
$$

## Greek Letters and Symbols

Variables: $\alpha, \beta, \gamma, \delta, \epsilon$

Set operations: $A \cup B$, $A \cap B$, $A \subset B$

Logic: $\forall x \in \mathbb{R}: x^2 \geq 0$

---

# Slide 4: Test Complete

## Success Indicators

If math rendering works properly in presentation mode, you should see:

1. ✅ Properly formatted inline equations like $\sum_{i=1}^n i = \frac{n(n+1)}{2}$
2. ✅ Centered display equations with correct typography
3. ✅ Complex symbols, fractions, integrals, and matrices
4. ✅ No raw LaTeX code visible (e.g., no `$` or `$$` symbols)

## Test Instructions

1. Switch to **Preview Mode** to see if math renders in preview
2. Switch to **Presentation Mode** to test slide-based math rendering
3. Navigate between slides to ensure math renders on all slides
4. Check that both inline and display math work correctly

**Expected Result**: All mathematical expressions should render beautifully! 📐✨