"""Small G-code subset parser; consume the whole line before accepting it."""

from math import isfinite


def _separator_end(line, index):
    while index < len(line):
        char = line[index]
        if char in " \t":
            index += 1
        elif char == ";":
            return len(line)
        elif char == "(":
            end = line.find(")", index + 1)
            if end < 0 or "(" in line[index + 1:end]:
                raise ValueError("invalid comment")
            index = end + 1
        else:
            break
    return index


def _number_end(line, index):
    # Scan ASCII decimal/exponent syntax without a token list or regex findall.
    if index < len(line) and line[index] in "+-":
        index += 1
    digits = 0
    while index < len(line) and "0" <= line[index] <= "9":
        digits += 1
        index += 1
    if index < len(line) and line[index] == ".":
        index += 1
        while index < len(line) and "0" <= line[index] <= "9":
            digits += 1
            index += 1
    if not digits:
        raise ValueError("missing number")
    if index < len(line) and line[index] == "E":
        index += 1
        if index < len(line) and line[index] in "+-":
            index += 1
        start = index
        while index < len(line) and "0" <= line[index] <= "9":
            index += 1
        if index == start:
            raise ValueError("missing exponent")
    return index


def parse_words(line):
    line = line.strip().upper()
    index = _separator_end(line, 0)
    if index == len(line):
        return "", {}
    family = line[index]
    if family not in "GMT":
        raise ValueError("missing command")
    index = _separator_end(line, index + 1)
    start = index
    while index < len(line) and "0" <= line[index] <= "9":
        index += 1
    if index == start:
        raise ValueError("invalid command")
    command = family + (line[start:index].lstrip("0") or "0")
    words = {}
    while True:
        index = _separator_end(line, index)
        if index == len(line):
            return command, words
        letter = line[index]
        if not "A" <= letter <= "Z" or letter in "GMT" or letter in words:
            raise ValueError("invalid or repeated word")
        start = _separator_end(line, index + 1)
        index = _number_end(line, start)
        value = float(line[start:index])
        if not isfinite(value):
            raise ValueError("nonfinite number")
        words[letter] = value


class ModalState:
    def __init__(self):
        self.absolute = True
        self.mm = True
        self.x = 0.0
        self.y = 0.0
        self.z = 1.0
        self.feed = 500.0
        self.enabled = False
        self.pen_down = False

    def coordinates(self, words, absolute):
        target = [self.x, self.y, self.z]
        for index, axis in enumerate(("X", "Y", "Z")):
            if axis in words:
                value = words[axis] * (1.0 if self.mm else 25.4)
                target[index] = value if absolute else target[index] + value
            if not isfinite(target[index]):
                raise ValueError("nonfinite coordinate")
        return tuple(target)

    def prepare_motion(self, words):
        target = self.coordinates(words, self.absolute)
        feed = self.feed
        if "F" in words:
            feed = words["F"] * (1.0 if self.mm else 25.4)
        if not isfinite(feed):
            raise ValueError("nonfinite feed")
        return target, max(1.0, feed)

    def motion(self, words):
        target, feed = self.prepare_motion(words)
        self.x, self.y, self.z = target
        self.feed = feed
        return target

