import { useState } from "react";
import Prism from "prismjs";
import "prismjs/components/index";
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-asm6502';
import 'prismjs/components/prism-apex';
import "prismjs/themes/prism.css";

Prism.languages["c++"] = Prism.languages.extend('cpp', {});
Prism.languages["jsx"] = Prism.languages.extend('js', {});

const CodeBlock = ({ children, className = "" }: { children: string; className?: string }) => {
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const language = className.replace("lang-", "");
  
  let html = "";
  try {
    html = Prism.highlight(children, Prism.languages[language], language);
  } catch (e) {
    html = children; // just use the original unhighlighted code if error arises
  }

  html = html.replace(/<\?php/g, '<&quest;php');
  return (language.length > 0 ? <div className="code-block-container mt-2">
        <span className="language-tag p-1 mx-1">{language}</span>
        <button onClick={handleCopy} className="copy-button p-1 mx-1">
          {isCopied ? 'Copied' : 'Copy code'}
        </button>
      
        <pre
          className={className + " p-2 m-1"}
          dangerouslySetInnerHTML={{ __html: html }}
          style={{textAlign: "left", backgroundColor: "#FAFAFA", overflow: "auto"}}
          />
      </div> :
     <span
        className={className + " p-1 m-1"}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{textAlign: "left", backgroundColor: "#FAFAFA", overflow: "auto"}} />);
};

export default CodeBlock;