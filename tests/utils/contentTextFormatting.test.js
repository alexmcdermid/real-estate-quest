import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatContentTextAsHtml,
  formatExplanationAsHtml,
} from "../../src/utils/contentTextFormatting";

// questionCard.vue and flashCard.vue render these strings with v-html, which sets innerHTML
function renderLikeVHtml(html) {
  const element = document.createElement("span");
  element.innerHTML = html;
  return element;
}

describe("contentTextFormatting", () => {
  const injectedText = "<img src=x onerror=alert(1)> **bold**";

  it("escapeHtml escapes & < > \" and '", () => {
    expect(escapeHtml("a & b < c > d \" e ' f")).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
    // & is escaped first, so entity text shows as written instead of being decoded
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("escapes AI question text before the bold and line break formatting", () => {
    const aiQuestion = { aiGenerated: true, question: `${injectedText}\nNext line` };
    const html = formatContentTextAsHtml(aiQuestion, aiQuestion.question);

    expect(html).toBe("&lt;img src=x onerror=alert(1)&gt; <b>bold</b><br><br>Next line");
    const rendered = renderLikeVHtml(html);
    expect(rendered.querySelector("img")).toBeNull();
    expect(rendered.querySelector("b").textContent).toBe("bold");
    expect(rendered.textContent).toBe("<img src=x onerror=alert(1)> boldNext line");
  });

  it("escapes AI explanation text before the bold italics formatting", () => {
    const html = formatExplanationAsHtml({ aiGenerated: true, explanation: `Correct Answer: 1 ${injectedText}` });

    expect(html).toBe("Correct Answer: 1 &lt;img src=x onerror=alert(1)&gt; <i><b>bold</b></i>");
    const rendered = renderLikeVHtml(html);
    expect(rendered.querySelector("img")).toBeNull();
    expect(rendered.querySelector("i > b").textContent).toBe("bold");
    expect(rendered.textContent).toBe("Correct Answer: 1 <img src=x onerror=alert(1)> bold");
  });

  it("renders human question and explanation text as before, entities and tags included", () => {
    const humanQuestion = {
      question: "Which conduct is **misconduct even if it breaks no rule**&#8203;?\n<i>Pick one</i>",
      explanation: "Correct Answer: 2 because it **doesn't** matter&#8203; <u>where</u> it occurs",
    };

    expect(formatContentTextAsHtml(humanQuestion, humanQuestion.question))
      .toBe("Which conduct is <b>misconduct even if it breaks no rule</b>&#8203;?<br><br><i>Pick one</i>");
    expect(formatExplanationAsHtml(humanQuestion))
      .toBe("Correct Answer: 2 because it <i><b>doesn't</b></i> matter&#8203; <u>where</u> it occurs");
  });

  it("escapes both faces of an AI flashcard before the bold and line break formatting", () => {
    const aiFlashcard = {
      aiGenerated: true,
      front: "<b onmouseover=alert(1)>Easement</b> & **Profit**",
      back: `${injectedText}\nSecond line`,
    };

    const frontHtml = formatContentTextAsHtml(aiFlashcard, aiFlashcard.front);
    const backHtml = formatContentTextAsHtml(aiFlashcard, aiFlashcard.back);

    expect(frontHtml).toBe("&lt;b onmouseover=alert(1)&gt;Easement&lt;/b&gt; &amp; <b>Profit</b>");
    expect(renderLikeVHtml(frontHtml).querySelectorAll("b")).toHaveLength(1);
    expect(renderLikeVHtml(frontHtml).textContent).toBe("<b onmouseover=alert(1)>Easement</b> & Profit");
    expect(backHtml).toBe("&lt;img src=x onerror=alert(1)&gt; <b>bold</b><br><br>Second line");
    expect(renderLikeVHtml(backHtml).querySelector("img")).toBeNull();
  });

  it("renders human flashcard faces as written, with the same bold and line break formatting", () => {
    const humanFlashcard = {
      front: "Accelerated **Biweekly** Payments",
      back: "Half a monthly payment&#8203;\n<i>every two weeks</i>",
    };

    expect(formatContentTextAsHtml(humanFlashcard, humanFlashcard.front)).toBe("Accelerated <b>Biweekly</b> Payments");
    expect(formatContentTextAsHtml(humanFlashcard, humanFlashcard.back))
      .toBe("Half a monthly payment&#8203;<br><br><i>every two weeks</i>");
  });
});
