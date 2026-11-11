"""Regex-free G-code word parser (MicroPython's re has no findall)."""


def strip_comments(line):
    out = []
    depth = 0
    for ch in line:
        if ch == ";" and depth == 0:
            break
        if ch == "(":
            depth += 1
        elif ch == ")" and depth:
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out).strip()


def parse(line):
    """Return (command, words, rest).

    command: "G1", "M28", ... or "" ; words: {letter: float}; rest: the raw text
    after the command (used by file-name commands such as M28 name.gcode).
    """
    text = strip_comments(line)
    if not text:
        return "", {}, ""
    upper = text.upper()
    command = ""
    rest = ""
    words = {}
    i = 0
    n = len(upper)
    while i < n:
        ch = upper[i]
        if ch == " " or ch == "\t":
            i += 1
            continue
        if not ("A" <= ch <= "Z"):
            raise ValueError("bad_word")
        j = i + 1
        while j < n and upper[j] == " ":
            j += 1
        k = j
        while k < n and upper[k] in "+-.0123456789":
            k += 1
        number = upper[j:k]
        if not number:
            raise ValueError("bad_number")
        value = float(number)
        if not command and ch in "GM" and value == int(value):
            command = ch + str(int(value))
            if ch == "M" and int(value) in (23, 24, 28, 30, 993):
                rest = text[k:].strip()
                break
        else:
            words[ch] = value
        i = k
    return command, words, rest
